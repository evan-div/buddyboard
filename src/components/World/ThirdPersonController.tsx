'use client'

// Desktop-only third-person "walk mode" for the plaza.
//
// Owns three things while active:
//   1. keyboard/mouse input (WASD, shift, space, E; pointer-locked mouse look)
//   2. the local player's character transform — the shared wander schedule in
//      plazaWalk.ts is suspended for this uid and we drive it directly
//   3. the camera: a spring arm that lags, widens FOV with speed, and eases
//      everywhere (all the math lives in thirdPerson.ts)
//
// Deliberately writes nothing to Firestore. Other members still see this
// character on the deterministic wander schedule; walking is local-only.

import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  makeMoveState, stepMovement,
  makeCamState, applyLook, applyZoom, stepCamera, cameraPlacement,
  nearestInteractable, resolveCharacterOverlap,
  clamp, smoothFactor, EDGE_MARGIN,
  CAM_PIVOT_Y, CAM_START_DIST, CAM_MIN_DIST, CAM_MAX_DIST,
  PITCH_MIN, PITCH_MAX, FOV_BASE, CARD_ANCHOR_Y, charHalfWidthPx,
  type MoveInput, type InteractCandidate, type Locomotion,
} from './thirdPerson'
import { clampToPlazaEdge } from './plazaMath'
import type { GroupMember } from '@/lib/types'

// Drag-to-orbit fallback, used when the pointer isn't locked (after Esc, or if
// the browser refuses the lock). Hotter than locked look: a drag runs out of
// screen, where a locked mouse can keep travelling forever.
const DRAG_SCALE = 1.8
// How fast the FOV eases back to the plaza default after leaving walk mode.
const RESTORE_RATE = 6

interface Props {
  active: boolean
  /** A member card is open: freeze input, but keep the camera easing. */
  paused: boolean
  /** prefers-reduced-motion: drop the FOV punch and the spring-arm trail. */
  reducedMotion: boolean
  playerUid: string
  members: GroupMember[]
  charGroups: React.RefObject<Map<string, THREE.Group>>
  locomotion: React.RefObject<Locomotion>
  onInteract: (uid: string) => void
  onTargetChange: (uid: string | null) => void
  onLockChange: (locked: boolean) => void
  /** Screen position (CSS px) of the character whose card is open, plus how wide
      they look on screen, so the DOM overlay can sit clear of them. Null when no
      card is open. */
  onCardAnchor: (anchor: { x: number; y: number; halfWidth: number } | null) => void
  onExit: () => void
}

export default function ThirdPersonController({
  active, paused, reducedMotion, playerUid, members, charGroups, locomotion,
  onInteract, onTargetChange, onLockChange, onCardAnchor, onExit,
}: Props) {
  const { camera, gl } = useThree()

  const move = useRef(makeMoveState())
  const cam  = useRef(makeCamState())
  const keys = useRef<Set<string>>(new Set())
  const jumpQueued = useRef(false)
  const locked   = useRef(false)
  const dragging = useRef(false)
  const seeded   = useRef(false)
  const target   = useRef<string | null>(null)

  const camPos  = useRef(new THREE.Vector3())
  const camLook = useRef(new THREE.Vector3())
  const projected  = useRef(new THREE.Vector3())
  const lastAnchor = useRef({ x: -1e9, y: -1e9, halfWidth: -1 })

  // Latest props for the window-level listeners, which are registered once and
  // must not be torn down and rebuilt every time `members` changes identity.
  const live = useRef({ active, paused, members, onInteract, onExit, onLockChange, onCardAnchor })
  live.current = { active, paused, members, onInteract, onExit, onLockChange, onCardAnchor }

  // ── Reset on entry ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      keys.current.clear()
      jumpQueued.current = false
      dragging.current = false
      seeded.current = false
      if (target.current !== null) { target.current = null; onTargetChange(null) }
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock()
      return
    }
    // Seeding happens on the first frame instead of here, because the player's
    // THREE.Group may not be registered in charGroups yet on this tick.
    seeded.current = false
  }, [active, gl.domElement, onTargetChange])

  // No card open: drop the anchor so the overlay stops positioning against a
  // character it's no longer showing.
  useEffect(() => {
    if (active && paused) return
    lastAnchor.current.x = -1e9
    lastAnchor.current.y = -1e9
    lastAnchor.current.halfWidth = -1
    onCardAnchor(null)
  }, [active, paused, onCardAnchor])

  // A card is open: give the cursor back. While the pointer is locked the
  // browser routes every click to the canvas, so the card's buttons would be
  // visible but completely unclickable.
  useEffect(() => {
    if (active && paused && document.pointerLockElement === gl.domElement) {
      document.exitPointerLock()
    }
  }, [active, paused, gl.domElement])

  // ── Pointer lock ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) return
    const el = gl.domElement

    function requestLock() {
      if (live.current.paused) return          // a card is open; leave the cursor free
      if (document.pointerLockElement === el) return
      // Can reject: not a user gesture, or the browser's post-Esc cooldown.
      // Mouse look just stays on the drag fallback until the next click.
      try { void Promise.resolve(el.requestPointerLock()).catch(() => {}) } catch { /* ignore */ }
    }

    function handleLockChange() {
      locked.current = document.pointerLockElement === el
      if (locked.current) dragging.current = false
      live.current.onLockChange(locked.current)
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0 && e.button !== 2) return
      if (document.pointerLockElement === el) return
      requestLock()
      dragging.current = true   // orbit by drag until (or unless) the lock lands
    }
    function onMouseUp() { dragging.current = false }

    function onMouseMove(e: MouseEvent) {
      if (locked.current) applyLook(cam.current, e.movementX, e.movementY)
      else if (dragging.current) applyLook(cam.current, e.movementX, e.movementY, DRAG_SCALE)
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()
      applyZoom(cam.current, e.deltaY)
    }

    function onContextMenu(e: MouseEvent) { e.preventDefault() }

    document.addEventListener('pointerlockchange', handleLockChange)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mousemove', onMouseMove)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContextMenu)
    requestLock()

    return () => {
      document.removeEventListener('pointerlockchange', handleLockChange)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mousemove', onMouseMove)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContextMenu)
      locked.current = false
    }
  }, [active, gl.domElement])

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Never swallow keys while the member card's text inputs have focus.
    function typing() {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
             (el as HTMLElement).isContentEditable
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!live.current.active || typing()) return

      if (e.code === 'Escape') {
        // The browser eats the first Esc to release the pointer lock; this
        // handler sees the second one and leaves walk mode.
        if (!locked.current) live.current.onExit()
        return
      }
      if (e.repeat) return
      keys.current.add(e.code)

      if (e.code === 'Space') {
        e.preventDefault()          // stop the page scrolling under the canvas
        if (!live.current.paused) jumpQueued.current = true
      }
      if (e.code === 'KeyE' && !live.current.paused && target.current) {
        live.current.onInteract(target.current)
      }
    }

    function onKeyUp(e: KeyboardEvent) { keys.current.delete(e.code) }
    // A tab-away with W held would otherwise leave the character walking forever
    function onBlur() { keys.current.clear() }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  // ── Frame ───────────────────────────────────────────────────────────────────
  // Scratch objects reused every frame — walk mode allocates nothing per frame.
  const inputRef   = useRef<MoveInput>({ forward: 0, strafe: 0, sprint: false, jump: false })
  const candidates = useRef<InteractCandidate[]>([])
  const blockers   = useRef<{ x: number; z: number }[]>([])

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1)
    const persp = camera as THREE.PerspectiveCamera

    if (!active) {
      // Ease the FOV back to the plaza default so leaving walk mode doesn't
      // pop. Position is OrbitControls' business again from here.
      if (persp.isPerspectiveCamera && Math.abs(persp.fov - FOV_BASE) > 0.01) {
        persp.fov += (FOV_BASE - persp.fov) * smoothFactor(RESTORE_RATE, dt)
        if (Math.abs(persp.fov - FOV_BASE) <= 0.01) persp.fov = FOV_BASE
        persp.updateProjectionMatrix()
      }
      return
    }

    const group = charGroups.current?.get(playerUid)
    if (!group) return

    // ── Seed from wherever the plaza camera already is, so entering walk mode
    //    is a continuous dolly rather than a cut. ────────────────────────────
    if (!seeded.current) {
      seeded.current = true
      const m = move.current
      m.pos.set(group.position.x, 0, group.position.z)
      m.vel.set(0, 0, 0)
      m.accel.set(0, 0, 0)
      m.speed = 0
      m.grounded = true
      m.yaw = group.rotation.y

      const c = cam.current
      const ax = m.pos.x, ay = CAM_PIVOT_Y, az = m.pos.z
      const ox = camera.position.x - ax
      const oy = camera.position.y - ay
      const oz = camera.position.z - az
      const len = Math.hypot(ox, oy, oz)
      c.pivot.set(ax, ay, az)
      c.lag.set(0, 0, 0)
      if (len > 0.01) {
        c.yaw   = Math.atan2(ox, oz)
        c.pitch = clamp(Math.asin(clamp(oy / len, -1, 1)), PITCH_MIN, PITCH_MAX)
        c.dist  = len                                   // start where we are…
      } else {
        c.dist = CAM_START_DIST
      }
      c.distTarget = clamp(CAM_START_DIST, CAM_MIN_DIST, CAM_MAX_DIST)  // …ease to here
      c.fov = persp.isPerspectiveCamera ? persp.fov : FOV_BASE
    }

    // ── Input → movement ────────────────────────────────────────────────────
    const k = keys.current
    const input = inputRef.current
    if (paused) {
      input.forward = 0
      input.strafe  = 0
      input.sprint  = false
      input.jump    = false
      jumpQueued.current = false
    } else {
      input.forward = (k.has('KeyW') || k.has('ArrowUp')   ? 1 : 0) -
                      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
      input.strafe  = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
                      (k.has('KeyA') || k.has('ArrowLeft')  ? 1 : 0)
      input.sprint  = k.has('ShiftLeft') || k.has('ShiftRight')
      input.jump    = jumpQueued.current
      jumpQueued.current = false
    }

    // ── Everyone else, gathered once ────────────────────────────────────────
    // Feeds both the collision pass and the interact search. Anyone off the
    // ground is being carried or thrown — they're not something to bump into.
    candidates.current.length = 0
    blockers.current.length = 0
    for (const member of live.current.members) {
      if (member.uid === playerUid) continue
      const g = charGroups.current?.get(member.uid)
      if (!g || !g.visible) continue
      candidates.current.push({ uid: member.uid, x: g.position.x, z: g.position.z })
      if (Math.abs(g.position.y) < 0.6) blockers.current.push({ x: g.position.x, z: g.position.z })
    }

    const m = move.current
    stepMovement(m, input, cam.current.yaw, dt)

    // Bump into people rather than through them, then re-clamp: being pushed
    // off someone standing on the rim must not push us off the island.
    if (resolveCharacterOverlap(m.pos, m.vel, blockers.current)) {
      clampToPlazaEdge(m.pos, EDGE_MARGIN)
    }

    group.position.set(m.pos.x, m.pos.y, m.pos.z)
    group.rotation.set(0, m.yaw, 0)

    const loco = locomotion.current
    if (loco) {
      loco.speed     = m.speed
      loco.airborne  = !m.grounded
      loco.sprinting = input.sprint && m.speed > 0.1
      loco.vy        = m.vel.y
      loco.pos.copy(m.pos)
    }

    // ── Camera ──────────────────────────────────────────────────────────────
    stepCamera(cam.current, { anchor: m.pos, vel: m.vel, accel: m.accel, reducedMotion }, dt)
    cameraPlacement(cam.current, camPos.current, camLook.current)
    camera.position.copy(camPos.current)
    camera.lookAt(camLook.current)
    if (persp.isPerspectiveCamera && Math.abs(persp.fov - cam.current.fov) > 1e-4) {
      persp.fov = cam.current.fov
      persp.updateProjectionMatrix()
    }

    // ── Interact target ─────────────────────────────────────────────────────
    const found = paused ? target.current
      : nearestInteractable(m.pos.x, m.pos.z, m.yaw, candidates.current)
    if (found !== target.current) {
      target.current = found
      onTargetChange(found)
    }

    // ── Card anchor ─────────────────────────────────────────────────────────
    // While a card is open, keep reporting where its character actually is on
    // screen. Tracking rather than sampling once matters because the camera is
    // still easing for a few hundred ms after E — the walker decelerates and
    // the spring arm settles — so a one-shot projection would drift out of
    // alignment right as the card appears.
    if (paused && target.current) {
      const g = charGroups.current?.get(target.current)
      if (g) {
        // camera.lookAt() above only touched rotation; matrixWorld is stale
        // until the renderer runs, and project() reads its inverse.
        camera.updateMatrixWorld()
        projected.current.set(g.position.x, g.position.y + CARD_ANCHOR_Y, g.position.z)
        const dist = camera.position.distanceTo(projected.current)
        projected.current.project(camera)
        const el = gl.domElement
        const sx = ((projected.current.x + 1) / 2) * el.clientWidth
        const sy = ((1 - projected.current.y) / 2) * el.clientHeight
        // Report how wide they look, so the card can clear their silhouette
        // instead of a bare point — up close a bean fills a lot of screen.
        const halfWidth = charHalfWidthPx(
          persp.isPerspectiveCamera ? persp.fov : FOV_BASE,
          el.clientHeight,
          dist,
        )
        if (Math.abs(sx - lastAnchor.current.x) > 1.5 ||
            Math.abs(sy - lastAnchor.current.y) > 1.5 ||
            Math.abs(halfWidth - lastAnchor.current.halfWidth) > 2) {
          lastAnchor.current.x = sx
          lastAnchor.current.y = sy
          lastAnchor.current.halfWidth = halfWidth
          live.current.onCardAnchor({ x: sx, y: sy, halfWidth })
        }
      }
    }
  })

  return null
}
