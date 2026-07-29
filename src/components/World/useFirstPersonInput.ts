'use client'

import { useEffect, useRef } from 'react'

// Keyboard + Pointer Lock plumbing for first-person mode. Everything lands in
// refs rather than state: the r3f frame loop reads them every frame, and a
// re-render per keypress would be both wasteful and a frame behind.

export type FPKeys = {
  forward: number      // -1..1 (W/S, ArrowUp/ArrowDown)
  strafe: number       // -1..1 (D/A, ArrowRight/ArrowLeft)
  sprint: boolean
  jumpQueued: boolean  // set on Space, consumed by the frame loop
}

export type FPLook = { dx: number; dy: number }   // accumulated, drained per frame

function emptyKeys(): FPKeys {
  return { forward: 0, strafe: 0, sprint: false, jumpQueued: false }
}

// Don't steal keystrokes from anything the user is typing into.
function typingInDOM(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useFirstPersonInput({
  enabled,
  canvas,
  onLockChange,
  onInteract,
}: {
  enabled: boolean
  canvas: HTMLCanvasElement | null
  onLockChange: (locked: boolean) => void
  onInteract: () => void
}): { keys: React.RefObject<FPKeys>; look: React.RefObject<FPLook> } {
  const keys = useRef<FPKeys>(emptyKeys())
  const look = useRef<FPLook>({ dx: 0, dy: 0 })
  // Which movement keys are physically down, so releasing one of an opposing
  // pair (A while D is still held) resolves to the right direction instead of 0.
  const down = useRef<Set<string>>(new Set())
  // E must be released before it can fire again — no autofire from key repeat.
  const eHeld = useRef(false)

  // Latest callbacks without re-subscribing every listener when they change
  const onLockChangeRef = useRef(onLockChange)
  const onInteractRef   = useRef(onInteract)
  useEffect(() => { onLockChangeRef.current = onLockChange }, [onLockChange])
  useEffect(() => { onInteractRef.current   = onInteract   }, [onInteract])

  useEffect(() => {
    if (!enabled || !canvas) return

    function resetKeys() {
      down.current.clear()
      eHeld.current = false
      keys.current = emptyKeys()
      look.current.dx = 0
      look.current.dy = 0
    }

    // Derive the axes from the held set so opposing keys cancel and releasing
    // one leaves the other still driving.
    function recompute() {
      const d = down.current
      const fwd = (d.has('KeyW') || d.has('ArrowUp')   ? 1 : 0) - (d.has('KeyS') || d.has('ArrowDown')  ? 1 : 0)
      const str = (d.has('KeyD') || d.has('ArrowRight') ? 1 : 0) - (d.has('KeyA') || d.has('ArrowLeft') ? 1 : 0)
      keys.current.forward = fwd
      keys.current.strafe  = str
      keys.current.sprint  = d.has('ShiftLeft') || d.has('ShiftRight')
    }

    const MOVE_CODES = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'ShiftLeft', 'ShiftRight',
    ])

    function onKeyDown(e: KeyboardEvent) {
      if (typingInDOM()) return
      // event.code, not event.key — position-based so AZERTY/Dvorak still walk
      // with the same three keys, and so Shift doesn't remap the letters.
      if (MOVE_CODES.has(e.code)) {
        down.current.add(e.code)
        recompute()
        if (e.code.startsWith('Arrow')) e.preventDefault()   // page scroll
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()                                    // page scroll
        if (!e.repeat) keys.current.jumpQueued = true
        return
      }
      if (e.code === 'KeyE') {
        if (e.repeat || eHeld.current) return
        eHeld.current = true
        onInteractRef.current()
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (MOVE_CODES.has(e.code)) {
        down.current.delete(e.code)
        recompute()
        return
      }
      if (e.code === 'KeyE') eHeld.current = false
    }

    function onMouseMove(e: MouseEvent) {
      if (document.pointerLockElement !== canvas) return
      look.current.dx += e.movementX
      look.current.dy += e.movementY
    }

    // The single source of truth for lock state. Esc, a tab switch, and an
    // explicit exitPointerLock() all arrive here — nothing else guesses.
    function onLockChangeEvent() {
      const locked = document.pointerLockElement === canvas
      if (!locked) resetKeys()
      onLockChangeRef.current(locked)
    }

    // Alt-tabbing mid-sprint must not leave the key stuck down: the keyup is
    // delivered to whatever window has focus, not to us.
    function onBlur() { resetKeys() }
    function onVisibility() { if (document.hidden) resetKeys() }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerlockchange', onLockChangeEvent)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerlockchange', onLockChangeEvent)
      resetKeys()
    }
  }, [enabled, canvas])

  return { keys, look }
}
