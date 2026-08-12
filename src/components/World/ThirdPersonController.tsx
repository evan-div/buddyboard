'use client'

// Third-person "walk mode" for the plaza.
//
// Owns three things while active:
//   1. input — either keyboard/mouse (WASD, shift, space, E; pointer-locked
//      mouse look) or touch (tap-to-move, drag-to-orbit, pinch-to-zoom),
//      selected by the `control` prop. The two schemes never run at once.
//   2. the local player's character transform — the shared wander schedule in
//      plazaWalk.ts is suspended for this uid and we drive it directly
//   3. the camera: a spring arm that lags, widens FOV with speed, and eases
//      everywhere (all the math lives in thirdPerson.ts)
//
// Deliberately writes nothing to Firestore. Other members still see this
// character on the deterministic wander schedule; walking is local-only.

import { useCallback, useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  makeMoveState, stepMovement,
  makeCamState, applyLook, applyZoom, stepCamera, cameraPlacement,
  nearestInteractable, resolveCharacterOverlap,
  clamp, smoothFactor,
  CAM_PIVOT_Y, CAM_START_DIST, CAM_MIN_DIST, CAM_MAX_DIST,
  PITCH_MIN, PITCH_MAX, FOV_BASE, CARD_ANCHOR_Y, charHalfWidthPx,
  DOUBLE_TAP_MS, FLIP_PIVOT_Y, FALL_HANDOFF_Y,
  type MoveInput, type InteractCandidate, type Locomotion,
} from './thirdPerson'
import {
  makeSeekState, setSeekTarget, clearSeek, seekInput,
  classifyTouch, isRunUpgrade, ndcFromClient, clampRange,
  GROUND_PICK_Y, TOUCH_LOOK_SCALE, PINCH_TO_WHEEL, MARKER_FADE_RATE, STOP_TOLERANCE,
} from './tapMove'
import { AXIS_X, AXIS_Y } from './plazaMath'
import { resolveArchipelagoGround, isOnGround, type IslandDef } from './plazaIslands'
import { playWhoosh, buzz } from './plazaSound'
import type { GroupMember } from '@/lib/types'

// Drag-to-orbit fallback, used when the pointer isn't locked (after Esc, or if
// the browser refuses the lock). Hotter than locked look: a drag runs out of
// screen, where a locked mouse can keep travelling forever.
const DRAG_SCALE = 1.8
// How fast the FOV eases back to the plaza default after leaving walk mode.
const RESTORE_RATE = 6
// How far below the island the camera will ride while the physics carries a
// fallen walker down. They despawn at -30 and are hidden for over a second;
// following that far leaves you looking at nothing.
const FALL_CAM_FLOOR = -3.5

// The destination marker: a ring on the ground with a pip at its centre. Sized
// so the walker reliably comes to rest inside it — braking has to commit early
// enough to never overshoot, so they can stop up to STOP_TOLERANCE short, and a
// tighter ring would make every short trip look like a miss.
const MARKER_RINGS = [
  { inner: STOP_TOLERANCE + 0.02, outer: STOP_TOLERANCE + 0.14, opacity: 0.85 },
  { inner: 0,                     outer: 0.09,                  opacity: 0.7  },
]

interface Props {
  active: boolean
  /** Which input scheme owns the canvas. 'keyboard' is the desktop path (WASD
      plus pointer-locked mouse look); 'touch' is tap-to-move. Never both. */
  control: 'keyboard' | 'touch'
  /** A member card is open: freeze input, but keep the camera easing. */
  paused: boolean
  /** prefers-reduced-motion: drop the FOV punch and the spring-arm trail. */
  reducedMotion: boolean
  /** The plaza physics owns the body (falling off the map, respawning). Keep
      the camera on them, but don't drive them. */
  suspended: boolean
  playerUid: string
  members: GroupMember[]
  charGroups: React.RefObject<Map<string, THREE.Group>>
  locomotion: React.RefObject<Locomotion>
  /** The plaza sets this when a touch lands on a character. That tap belongs to
      their member card, so tap-to-move must not also claim it as a destination
      and walk off toward the ground behind them. Cleared here when consumed. */
  tapOnCharacter: React.RefObject<boolean>
  onInteract: (uid: string) => void
  onTargetChange: (uid: string | null) => void
  onLockChange: (locked: boolean) => void
  /** Screen position (CSS px) of the character whose card is open, plus how wide
      they look on screen, so the DOM overlay can sit clear of them. Null when no
      card is open. */
  onCardAnchor: (anchor: { x: number; y: number; halfWidth: number } | null) => void
  /** Walked off the island and dropped clear of it — hand the body over. */
  onFellOff: (pos: THREE.Vector3, vel: THREE.Vector3) => void
  onExit: () => void
  /** Every island the group has earned. Ground is any of them, or a deck. */
  islands: readonly IslandDef[]
}

export default function ThirdPersonController({
  active, control, paused, reducedMotion, suspended, playerUid, members, charGroups, locomotion,
  tapOnCharacter, onInteract, onTargetChange, onLockChange, onCardAnchor, onFellOff, onExit, islands,
}: Props) {
  const { camera, gl } = useThree()

  // The whole archipelago is walkable, bridges included. Rebuilt only when an
  // island unlocks; stepMovement calls it every frame, so it allocates nothing.
  const islandsRef = useRef(islands)
  islandsRef.current = islands
  const resolveGround = useCallback(
    (pos: THREE.Vector3) => resolveArchipelagoGround(pos, islandsRef.current),
    [],
  )

  const move = useRef(makeMoveState())
  const cam  = useRef(makeCamState())
  const keys = useRef<Set<string>>(new Set())

  // ── Touch ──────────────────────────────────────────────────────────────────
  const seek       = useRef(makeSeekState())
  const pendingTap = useRef<{ clientX: number; clientY: number; run: boolean } | null>(null)
  const markerRef  = useRef<THREE.Group>(null)
  const markerFade = useRef(0)
  // The in-flight gesture. 'candidate' is a single finger that could still turn
  // out to be either a tap or an orbit drag — we don't know until it moves or
  // lifts.
  const gesture = useRef({
    mode: 'none' as 'none' | 'candidate' | 'drag' | 'pinch',
    id: -1,
    x0: 0, y0: 0, lastX: 0, lastY: 0, t0: 0,
    prevPinch: 0,
    lastTapX: 0, lastTapY: 0, lastTapMs: -Infinity,
  })
  const jumpQueued = useRef(false)
  const flipQueued = useRef(false)
  const lastJumpTap = useRef(0)
  const prevFlipping = useRef(false)
  const prevSuspended = useRef(false)
  const fellOffSent = useRef(false)
  const locked   = useRef(false)
  const dragging = useRef(false)
  const seeded   = useRef(false)
  const target   = useRef<string | null>(null)

  const camPos  = useRef(new THREE.Vector3())
  const camLook = useRef(new THREE.Vector3())
  const projected  = useRef(new THREE.Vector3())
  const flipQuat   = useRef(new THREE.Quaternion())
  const flipTmpQ   = useRef(new THREE.Quaternion())
  const flipPivot  = useRef(new THREE.Vector3())
  const flipRot    = useRef(new THREE.Vector3())
  const suspAnchor = useRef(new THREE.Vector3())
  const zeroVec    = useRef(new THREE.Vector3())
  const lastAnchor = useRef({ x: -1e9, y: -1e9, halfWidth: -1 })
  const ndc        = useRef(new THREE.Vector2())
  const ray        = useRef(new THREE.Raycaster())
  const hit        = useRef(new THREE.Vector3())
  // The tap plane sits at the grass tops, not the floor — see GROUND_PICK_Y.
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_PICK_Y))

  // Latest props for the window-level listeners, which are registered once and
  // must not be torn down and rebuilt every time `members` changes identity.
  const live = useRef({ active, control, paused, members, onInteract, onExit, onLockChange, onCardAnchor, onFellOff })
  live.current = { active, control, paused, members, onInteract, onExit, onLockChange, onCardAnchor, onFellOff }

  // ── Reset on entry ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active) {
      keys.current.clear()
      jumpQueued.current = false
      dragging.current = false
      seeded.current = false
      clearSeek(seek.current)
      pendingTap.current = null
      gesture.current.mode = 'none'
      gesture.current.lastTapMs = -Infinity
      markerFade.current = 0
      if (target.current !== null) { target.current = null; onTargetChange(null) }
      if (document.pointerLockElement === gl.domElement) document.exitPointerLock()
      return
    }
    // Seeding happens on the first frame instead of here, because the player's
    // THREE.Group may not be registered in charGroups yet on this tick.
    seeded.current = false
    // The plaza sets this on any touch that lands on a character, walk mode or
    // not, and only the walk-mode handler clears it. Tapping a buddy to open
    // their card and *then* entering walk mode would otherwise leave the claim
    // standing, and eat the first tap-to-walk.
    tapOnCharacter.current = false
  }, [active, gl.domElement, onTargetChange, tapOnCharacter])

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
  // Keyboard control only. On touch this must not mount at all: Android Chrome
  // will happily grant a pointer lock, and once it has one every subsequent
  // touch is routed as a locked mouse event and the canvas stops responding.
  useEffect(() => {
    if (!active || control !== 'keyboard') return
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
  }, [active, control, gl.domElement])

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
      // Registered once, for the lifetime of the component, so the gate is on
      // the live props rather than the effect's deps.
      if (!live.current.active || live.current.control !== 'keyboard' || typing()) return

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
        if (!live.current.paused) {
          // Two taps in quick succession: the first has already launched the
          // jump, so the second asks for a backflip rather than a second jump.
          // Time the gap with the event's own timestamp, not the clock as the
          // handler runs. They're the same timeline, but a busy main thread can
          // deliver a keydown long after the key was pressed — measuring on
          // arrival turns a genuine double-tap into two separate jumps whenever
          // the scene hitches.
          const now = e.timeStamp || performance.now()
          if (now - lastJumpTap.current <= DOUBLE_TAP_MS) flipQueued.current = true
          else jumpQueued.current = true
          lastJumpTap.current = now
        }
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

  // ── Touch ───────────────────────────────────────────────────────────────────
  // The mirror of the mouse effect above, and the reason walk mode owns touch
  // outright while it's active: the plaza's own touch handlers exist to feed
  // OrbitControls and the carry raycaster, both of which are switched off in
  // walk mode, and they stand down for the duration (see MiiPlaza).
  //
  // One finger is ambiguous on arrival. It becomes a drag the moment it travels
  // past the slop, and a tap only if it lifts without ever doing so — which is
  // why the walk command commits on touchend rather than touchstart.
  //
  // The tempting alternative is to commit on touchstart and cancel if the finger
  // later moves: lower latency, but then every orbit drag begins with the
  // character lurching off toward whatever was under the thumb before aborting.
  // A ~60-90ms quick-tap release is much cheaper than that.
  useEffect(() => {
    if (!active || control !== 'touch') return
    const el = gl.domElement
    const g  = gesture.current

    function reset() {
      g.mode = 'none'
      g.id = -1
      g.prevPinch = 0
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length >= 2) {
        // A second finger arriving destroys any candidate, so lifting the first
        // one out of a pinch can never register as a stray walk command.
        g.mode = 'pinch'
        g.prevPinch = 0
        return
      }
      if (g.mode !== 'none') return
      const t = e.touches[0]
      if (!t) return
      g.mode = 'candidate'
      g.id = t.identifier
      g.x0 = g.lastX = t.clientX
      g.y0 = g.lastY = t.clientY
      g.t0 = e.timeStamp
    }

    function onTouchMove(e: TouchEvent) {
      if (g.mode === 'pinch') {
        if (e.touches.length < 2) return
        e.preventDefault()
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        )
        if (!g.prevPinch) { g.prevPinch = d; return }
        // Sign matches the plaza's own pinch (fingers together = zoom out), so
        // the gesture means the same thing inside walk mode and outside it.
        applyZoom(cam.current, (g.prevPinch - d) * PINCH_TO_WHEEL)
        g.prevPinch = d
        return
      }
      if (g.mode !== 'candidate' && g.mode !== 'drag') return

      const t = Array.from(e.touches).find((x) => x.identifier === g.id)
      if (!t) return
      e.preventDefault()

      if (g.mode === 'candidate' &&
          classifyTouch(t.clientX - g.x0, t.clientY - g.y0, e.timeStamp - g.t0) === 'drag') {
        g.mode = 'drag'
      }
      // lastX/lastY advance on every move, candidate or not, so the frame that
      // crosses the slop threshold orbits by that frame's delta rather than
      // snapping through the whole accumulated 10px.
      if (g.mode === 'drag') {
        applyLook(cam.current, t.clientX - g.lastX, t.clientY - g.lastY, TOUCH_LOOK_SCALE)
      }
      g.lastX = t.clientX
      g.lastY = t.clientY
    }

    function onTouchEnd(e: TouchEvent) {
      const t = Array.from(e.changedTouches).find((x) => x.identifier === g.id)
      // A touch that landed on a buddy opens their card; it is not also a
      // request to walk to the patch of grass behind them. Read and clear
      // whether or not this turned out to be a tap, so the claim never carries
      // over into the next gesture.
      const claimed = tapOnCharacter.current
      tapOnCharacter.current = false

      if (!claimed && g.mode === 'candidate' && t && !live.current.paused &&
          classifyTouch(t.clientX - g.x0, t.clientY - g.y0, e.timeStamp - g.t0) === 'tap') {
        // Time the double-tap off the event's own timestamp, not the clock as
        // the handler runs — the same reason the backflip does (a busy main
        // thread can deliver a touchend long after the finger left the glass,
        // which turns a real double-tap into two separate walk commands
        // whenever the scene hitches).
        const ms = e.timeStamp || performance.now()
        pendingTap.current = {
          clientX: t.clientX,
          clientY: t.clientY,
          run: isRunUpgrade(g.lastTapX, g.lastTapY, g.lastTapMs, t.clientX, t.clientY, ms),
        }
        g.lastTapX = t.clientX
        g.lastTapY = t.clientY
        g.lastTapMs = ms
      }
      if (e.touches.length === 0) reset()
    }

    el.addEventListener('touchstart',  onTouchStart,  { passive: false })
    el.addEventListener('touchmove',   onTouchMove,   { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: false })
    el.addEventListener('touchcancel', reset,         { passive: false })

    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', reset)
      reset()
    }
  }, [active, control, gl.domElement, tapOnCharacter])

  // ── Frame ───────────────────────────────────────────────────────────────────
  // Scratch objects reused every frame — walk mode allocates nothing per frame.
  const inputRef   = useRef<MoveInput>({ forward: 0, strafe: 0, sprint: false, jump: false, flip: false })
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

    // ── Suspended: the plaza physics has the body ───────────────────────────
    // We fell off the map. Physics is tumbling us into the clouds, despawning
    // us and dropping us back in from the sky — the same sequence a thrown
    // character gets. Just keep the camera on the body and stay out of the way.
    if (suspended) {
      prevSuspended.current = true
      // Drop any destination. Otherwise a walker who stepped off the rim would
      // resume marching at a target they chose before the fall, the moment the
      // sky respawn hands the body back.
      clearSeek(seek.current)
      pendingTap.current = null
      suspAnchor.current.copy(group.position)
      // Don't ride all the way down: the character despawns at -30 and is
      // invisible for over a second, and following that leaves you staring
      // into empty sky. Watch them drop away from near the rim instead.
      suspAnchor.current.y = Math.max(suspAnchor.current.y, FALL_CAM_FLOOR)
      stepCamera(cam.current, {
        anchor: suspAnchor.current,
        vel: zeroVec.current,
        accel: zeroVec.current,
        reducedMotion,
      }, dt)
      cameraPlacement(cam.current, camPos.current, camLook.current)
      camera.position.copy(camPos.current)
      camera.lookAt(camLook.current)

      const loco = locomotion.current
      if (loco) {
        loco.speed = 0
        loco.airborne = true
        loco.sprinting = false
        loco.vy = 0
        loco.pos.copy(group.position)
      }
      if (target.current !== null) {
        target.current = null
        onTargetChange(null)
      }
      return
    }

    // Physics just handed the body back (respawn finished): pick up from
    // wherever it put us rather than from the stale pre-fall position.
    if (prevSuspended.current) {
      prevSuspended.current = false
      fellOffSent.current = false
      seeded.current = false
    }

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

    // ── Tap → destination ───────────────────────────────────────────────────
    // Deferred out of the touch handler and into the frame for two reasons: the
    // handler stays free of THREE work, and the pick has to happen *before*
    // stepCamera moves the camera. Raycast after it and the tap resolves
    // against a view the player never saw.
    const m = move.current
    const tap = pendingTap.current
    if (tap) {
      pendingTap.current = null
      if (control === 'touch' && !paused) {
        ndcFromClient(tap.clientX, tap.clientY, gl.domElement.getBoundingClientRect(), ndc.current)
        ray.current.setFromCamera(ndc.current, camera)
        // A ray parallel to the ground, or pointing up out of it, returns null —
        // that's a tap into the sky, which is a mis-tap rather than a request.
        // Silent: no marker, no haptic.
        if (ray.current.ray.intersectPlane(groundPlane.current, hit.current)) {
          // Clamp the reach rather than rejecting: the camera's pitch floor is
          // near horizontal, so a tap a few pixels under the horizon meets the
          // ground plane most of a kilometre away.
          clampRange(hit.current, m.pos)
          // Deliberately not gated on isOverIsland. The rim is a cliff, not a
          // fence, and walking off it on purpose is a feature — stepMovement
          // drops you and the plaza physics takes the body from there.
          setSeekTarget(seek.current, hit.current.x, hit.current.z, tap.run)
          markerRef.current?.position.set(hit.current.x, GROUND_PICK_Y + 0.015, hit.current.z)
          buzz(6)
        }
      }
    }

    // ── Input → movement ────────────────────────────────────────────────────
    const k = keys.current
    const input = inputRef.current
    if (paused) {
      input.forward = 0
      input.strafe  = 0
      input.sprint  = false
      input.jump    = false
      input.flip    = false
      jumpQueued.current = false
      flipQueued.current = false
      clearSeek(seek.current)
    } else if (control === 'touch') {
      // Touch has no jump affordance — no button, no gesture. Leaving them
      // wired to nothing is the whole point rather than an omission.
      input.jump = false
      input.flip = false
      seekInput(seek.current, m.pos, m.vel, cam.current.yaw, dt, input)
    } else {
      input.forward = (k.has('KeyW') || k.has('ArrowUp')   ? 1 : 0) -
                      (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
      input.strafe  = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
                      (k.has('KeyA') || k.has('ArrowLeft')  ? 1 : 0)
      input.sprint  = k.has('ShiftLeft') || k.has('ShiftRight')
      input.jump    = jumpQueued.current
      input.flip    = flipQueued.current
      jumpQueued.current = false
      flipQueued.current = false
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

    // Tap-to-move faces where it's actually going. Compression exists to hide a
    // camera-relative artifact that only WASD produces — see FacingMode.
    stepMovement(m, input, cam.current.yaw, dt, control === 'touch' ? 'travel' : 'camera', resolveGround)

    // Bump into people rather than walking through them. No edge clamp after
    // it: the rim is a cliff now, and everyone else wanders well inside it, so
    // a 0.68u nudge can't shove you off.
    resolveCharacterOverlap(m.pos, m.vel, blockers.current)

    if (m.flipping && !prevFlipping.current) playWhoosh(7)
    prevFlipping.current = m.flipping

    if (m.flip > 0) {
      // Yaw first, then rotate backwards about the character's own right axis.
      // Composing quaternions rather than setting Euler angles keeps the flip
      // on the body's axis instead of a world one once they've turned.
      const q = flipQuat.current
      q.setFromAxisAngle(AXIS_Y, m.yaw)
      q.multiply(flipTmpQ.current.setFromAxisAngle(AXIS_X, -m.flip * Math.PI * 2))
      group.quaternion.copy(q)
      // Rotate about the middle of the body, not the group origin at their
      // feet — otherwise the whole bean swings through the floor.
      flipPivot.current.set(0, FLIP_PIVOT_Y, 0)
      flipRot.current.copy(flipPivot.current).applyQuaternion(q)
      group.position.set(
        m.pos.x + flipPivot.current.x - flipRot.current.x,
        m.pos.y + flipPivot.current.y - flipRot.current.y,
        m.pos.z + flipPivot.current.z - flipRot.current.z,
      )
    } else {
      group.position.set(m.pos.x, m.pos.y, m.pos.z)
      group.rotation.set(0, m.yaw, 0)
    }

    // Off the edge and dropping clear of the island: hand the body to the
    // plaza physics, which already owns tumble → despawn → sky respawn.
    if (!fellOffSent.current && m.pos.y < FALL_HANDOFF_Y && !isOnGround(m.pos.x, m.pos.z, islandsRef.current)) {
      fellOffSent.current = true
      live.current.onFellOff(m.pos, m.vel)
    }

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

    // ── Destination marker ──────────────────────────────────────────────────
    // Eased through smoothFactor rather than a flat per-frame alpha, like every
    // other transition here.
    const markerGroup = markerRef.current
    if (markerGroup) {
      const goal = seek.current.active ? 1 : 0
      markerFade.current += (goal - markerFade.current) * smoothFactor(MARKER_FADE_RATE, dt)
      if (Math.abs(goal - markerFade.current) < 0.004) markerFade.current = goal
      markerGroup.visible = markerFade.current > 0.01
      if (markerGroup.visible) {
        for (let i = 0; i < markerGroup.children.length; i++) {
          const mesh = markerGroup.children[i] as THREE.Mesh
          const mat  = mesh.material as THREE.MeshBasicMaterial
          mat.opacity = MARKER_RINGS[i].opacity * markerFade.current
        }
      }
    }

    // ── Interact target ─────────────────────────────────────────────────────
    // Keyboard only. On touch there's no E key and no interact prompt: tapping
    // a buddy opens their card outright, so nothing consumes this and the cone
    // search would be per-frame work for nobody.
    const found = control === 'touch' ? null
      : paused ? target.current
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
    //
    // Keyboard only: on touch the card is the app's bottom sheet, pinned to the
    // foot of the screen, and has nothing to anchor against a character.
    if (control === 'keyboard' && paused && target.current) {
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

  // The destination marker lives here rather than in a sibling component so it
  // reads the seek state directly instead of needing another shared ref. Flat on
  // the ground and stacked a hair apart, the same way the plaza's other ground
  // decals avoid z-fighting.
  if (control !== 'touch') return null
  return (
    <group ref={markerRef} visible={false}>
      {MARKER_RINGS.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, i * 0.002, 0]}>
          <ringGeometry args={[r.inner, r.outer, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}
