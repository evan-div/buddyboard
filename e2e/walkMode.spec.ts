import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

// End-to-end cover for third-person walk mode's state machine.
//
// Why this exists: the feel math in thirdPerson.ts is heavily unit-tested, but
// every bug that actually shipped during development lived in the React/R3F
// glue instead — an exit button that pointer lock made unclickable, a member
// card the cursor couldn't reach, a camera that orbited under the island. Unit
// tests structurally cannot see any of those. This drives the real seams:
// entering, pointer lock, the exit affordances, and leaving.
//
// Deliberately avoids asserting on anything that depends on where the wandering
// characters happen to be — their positions come from a wall-clock schedule, so
// proximity-dependent flows (walking up to someone, pressing E) can't be made
// deterministic from out here. The card placement geometry those flows exercise
// is covered directly in thirdPerson.test.ts.

const WALK_HINT = /WASD move/
const TOUCH_WALK_HINT = /Tap to walk/
const PLAZA_HINT = /Hold to carry/

// Firestore is pointed at a placeholder project, so its connection failures are
// expected noise. Uncaught exceptions are never acceptable.
const IGNORED = /firestore|firebase|net::ERR|Failed to fetch|ERR_BLOCKED|installations/i

function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' && !IGNORED.test(m.text())) errors.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`))
  return errors
}

// The scene needs a few painted frames before the walk button means anything.
async function openPlaza(page: Page) {
  await page.goto('/walkharness')
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: /Walk mode/ })).toBeVisible()
}

async function enterWalkMode(page: Page) {
  await page.getByRole('button', { name: /Walk mode/ }).click()
  await expect(page.getByText(WALK_HINT)).toBeVisible()
}

const isLocked = (page: Page) => page.evaluate(() => document.pointerLockElement !== null)

test.describe('third-person walk mode', () => {
  test('enters, locks the pointer, and exits back to the plaza', async ({ page }) => {
    const errors = watchForErrors(page)
    await openPlaza(page)
    await expect(page.getByText(PLAZA_HINT)).toBeVisible()

    await enterWalkMode(page)

    // Clicking the canvas is the user gesture that captures the cursor.
    await page.locator('canvas').click({ position: { x: 400, y: 300 } })
    await expect.poll(() => isLocked(page), { timeout: 30_000 }).toBe(true)

    // Regression: while the pointer is locked the browser routes every click to
    // the canvas, so an exit *button* here would be visible but dead. It has to
    // be a plain badge pointing at the key that works.
    await expect(page.getByText(/to release cursor/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Exit walk mode/ })).toHaveCount(0)

    // Regression: releasing the cursor must bring the real button back. This is
    // what the browser does for Esc, which headless Chromium doesn't implement.
    await page.evaluate(() => document.exitPointerLock())
    await expect.poll(() => isLocked(page), { timeout: 30_000 }).toBe(false)
    await expect(page.getByRole('button', { name: /Exit walk mode/ })).toBeVisible()

    // Esc with the cursor already free leaves walk mode entirely.
    await page.keyboard.press('Escape')
    await expect(page.getByText(PLAZA_HINT)).toBeVisible()
    await expect(page.getByRole('button', { name: /Walk mode/ })).toBeVisible()
    await expect(page.getByText(WALK_HINT)).toHaveCount(0)

    expect(errors).toEqual([])
  })

  test('the exit button also works when the pointer was never locked', async ({ page }) => {
    const errors = watchForErrors(page)
    await openPlaza(page)
    await enterWalkMode(page)

    await page.evaluate(() => document.exitPointerLock())
    await expect.poll(() => isLocked(page), { timeout: 30_000 }).toBe(false)

    await page.getByRole('button', { name: /Exit walk mode/ }).click()
    await expect(page.getByText(PLAZA_HINT)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('survives being driven with the movement keys', async ({ page }) => {
    const errors = watchForErrors(page)
    await openPlaza(page)
    await enterWalkMode(page)

    // Walk, sprint, jump, strafe, and orbit. Nothing here is observable in the
    // DOM — the point is that a frame loop driving the camera, the character,
    // the collision pass and the interact search never throws.
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(1200)
    await page.keyboard.down('ShiftLeft')
    await page.waitForTimeout(1200)
    await page.keyboard.press('Space')
    await page.waitForTimeout(600)
    await page.keyboard.down('KeyD')
    await page.waitForTimeout(1200)
    for (const key of ['KeyW', 'ShiftLeft', 'KeyD']) await page.keyboard.up(key)

    await page.mouse.move(400, 300)
    await page.mouse.move(700, 340, { steps: 12 })
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(800)
    await page.mouse.wheel(0, -400)
    await page.waitForTimeout(800)

    // Still rendering, and still in walk mode.
    await expect(page.getByText(WALK_HINT)).toBeVisible()
    const frames = await page.evaluate(
      () => new Promise<number>((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
          else res(n)
        }
        requestAnimationFrame(tick)
      }),
    )
    expect(frames).toBeGreaterThan(1)
    expect(errors).toEqual([])
  })

  // Regression: the plaza fills the viewport and the app's tab bar is fixed on
  // top of it, so anything anchored to the bottom of the plaza sits underneath
  // the bar unless it's lifted clear. The walk button was clipped by it, and
  // the controls hint was hidden by it completely.
  test('the walk controls clear the tab bar instead of hiding behind it', async ({ page }) => {
    await openPlaza(page)
    const bar = await page.locator('nav').boundingBox()
    expect(bar).not.toBeNull()

    const clears = async (label: string, box: { y: number; height: number } | null) => {
      expect(box, `${label} should be laid out`).not.toBeNull()
      expect(box!.y + box!.height, `${label} overlaps the tab bar`).toBeLessThanOrEqual(bar!.y)
    }

    await clears('plaza hint', await page.getByText(PLAZA_HINT).boundingBox())
    await clears('walk button', await page.getByRole('button', { name: /Walk mode/ }).boundingBox())

    await enterWalkMode(page)
    await clears('walk hint', await page.getByText(WALK_HINT).boundingBox())

    // Free the cursor so the exit control is the button rather than the Esc
    // badge, then check that too — they share the same anchor.
    await page.evaluate(() => document.exitPointerLock())
    await expect.poll(() => isLocked(page), { timeout: 30_000 }).toBe(false)
    await clears('exit button', await page.getByRole('button', { name: /Exit walk mode/ }).boundingBox())
  })

  // Regression: the gate is about what the device can *do*, not how wide the
  // window is. A narrow desktop window is still a mouse with no room for the
  // desktop scheme, and touch walk mode is not the fallback for it — this
  // context reports no touch points at all.
  test('is not offered in a narrow window with no touch', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 860 })
    await page.goto('/walkharness')
    await expect(page.locator('canvas')).toBeVisible()
    // The mobile hint proves the plaza itself rendered, so the missing walk
    // button is a real gate rather than a page that never loaded.
    await expect(page.getByText(/Pinch to zoom/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Walk mode/ })).toHaveCount(0)
  })
})

// ─── Touch ────────────────────────────────────────────────────────────────────
// Tap-to-move: the phone half of walk mode. Same reasoning as above — the seek
// math is unit-tested to death in tapMove.test.ts, so what's worth driving from
// out here is the wiring. Does the gate open on a touch device, does a real tap
// actually move the character, does a drag orbit instead of walking, and does
// the whole thing survive being poked at without throwing.

// Playwright has no high-level touch drag or pinch, so these build native
// TouchEvents directly. The walk-mode handlers are plain addEventListener
// listeners on the canvas, so a synthesized event runs exactly the same code a
// finger would.
async function touchGesture(
  page: Page,
  frames: { id: number; x: number; y: number }[][],
) {
  await page.evaluate(async (steps) => {
    const el = document.querySelector('canvas')!
    const make = (type: string, pts: { id: number; x: number; y: number }[]) => {
      const touches = pts.map((p) => new Touch({
        identifier: p.id, target: el, clientX: p.x, clientY: p.y,
      }))
      return new TouchEvent(type, {
        touches, targetTouches: touches, changedTouches: touches,
        bubbles: true, cancelable: true,
      })
    }
    el.dispatchEvent(make('touchstart', steps[0]))
    for (let i = 1; i < steps.length; i++) {
      el.dispatchEvent(make('touchmove', steps[i]))
      await new Promise((r) => requestAnimationFrame(r))
    }
    el.dispatchEvent(make('touchend', []))
  }, frames)
}

// Where the walker actually is, read straight off the locomotion the animator
// consumes. Nothing about walking reaches the DOM, so the harness publishes this
// reader for us (see WalkHarness).
const walkerPos = (page: Page) => page.evaluate(() => {
  const w = window as unknown as {
    __walkerPos?: () => { x: number; z: number; speed: number } | null
  }
  return w.__walkerPos?.() ?? null
})

// Fastest the walker travels over the next `ms`, sampled in-page so the polling
// interval can't miss the peak. Speed discriminates a walk from a run far more
// robustly than distance does: the destination is the same either way, and how
// far it is depends on where the wander schedule happens to have parked
// everyone.
const peakSpeed = (page: Page, ms: number) => page.evaluate((duration) => {
  const w = window as unknown as { __walkerPos?: () => { speed: number } | null }
  return new Promise<number>((resolve) => {
    let peak = 0
    const t0 = performance.now()
    const tick = () => {
      peak = Math.max(peak, w.__walkerPos?.()?.speed ?? 0)
      if (performance.now() - t0 < duration) requestAnimationFrame(tick)
      else resolve(peak)
    }
    requestAnimationFrame(tick)
  })
}, ms)

// Tap the canvas in-page, once or twice, as fast as the event loop allows.
//
// Why not page.touchscreen.tap() twice for a double-tap: each is a CDP
// round-trip, and under software rendering two of them land well over 280ms
// apart, so the gesture reads as two separate walk commands rather than a run.
//
// And why there are no timers in here at all: this page is a WebGL scene running
// on swiftshader, and the main thread is busy enough that a `setTimeout(25)`
// between touchstart and touchend has been measured taking **1163ms** — long
// past TAP_MAX_MS, so the "tap" was correctly thrown away as a slow press.
// Dispatching back to back sidesteps timer accuracy entirely: both taps land
// inside the double-tap window by construction. The window's real boundaries are
// unit-tested directly in tapMove.test.ts, which is where timing belongs.
//
// Synthesized touches don't produce the pointer events R3F hit-tests with, so
// these never open a member card. That's useful here — it isolates walk-versus-
// run from wherever the buddies have wandered to.
async function tapCanvas(page: Page, x: number, y: number, times = 1) {
  await page.evaluate(({ x, y, times }) => {
    const el = document.querySelector('canvas')!
    for (let i = 0; i < times; i++) {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      const ev = (type: string) => new TouchEvent(type, {
        touches: type === 'touchend' ? [] : [t],
        targetTouches: type === 'touchend' ? [] : [t],
        changedTouches: [t],
        bubbles: true, cancelable: true,
      })
      el.dispatchEvent(ev('touchstart'))
      el.dispatchEvent(ev('touchend'))
    }
  }, { x, y, times })
}

// Screen points to try, spread across the visible ground. Any individual one can
// land on a wandering buddy or above the horizon, so callers work down the list.
const GROUND_TAPS = [[330, 470], [120, 470], [300, 380], [140, 380], [210, 520], [360, 560]] as const

// A member card left open renders as a bottom sheet covering the lower half of
// the screen, and the next tap would hit the sheet instead of the canvas.
async function dismissCard(page: Page) {
  const close = page.getByRole('button', { name: 'Close' })
  if (await close.count()) await close.tap()
}

test.describe('walk mode on touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 420, height: 860 } })

  async function enterTouchWalk(page: Page) {
    await page.goto('/walkharness')
    await expect(page.locator('canvas')).toBeVisible()
    await page.getByRole('button', { name: /Walk mode/ }).tap()
    await expect(page.getByText(TOUCH_WALK_HINT)).toBeVisible()
    // The probe is published from a mount effect; under software rendering that
    // can trail the first paint.
    await expect.poll(() => walkerPos(page), { timeout: 30_000 }).not.toBeNull()
  }

  // Taking the character over from the wander animator nudges them a fraction of
  // a unit as the two hand off. Harmless in play, but a test that asserts
  // "nothing moved" has to start from a walker that has actually stopped —
  // otherwise it measures the tail of the handover and fails in proportion to
  // how slow the frames are, which is to say in proportion to how much scenery
  // happens to be on screen.
  async function walkerAtRest(page: Page) {
    let last: { x: number; z: number } | null = null
    await expect.poll(async () => {
      const now = await walkerPos(page)
      if (!now) return false
      const still = last !== null && Math.hypot(now.x - last.x, now.z - last.z) < 1e-4
      last = now
      return still
    }, { timeout: 30_000, intervals: [200] }).toBe(true)
  }

  test('is offered, and enters without ever grabbing the pointer', async ({ page }) => {
    const errors = watchForErrors(page)
    await page.goto('/walkharness')
    await expect(page.getByText(PLAZA_HINT)).toBeVisible()
    await page.getByRole('button', { name: /Walk mode/ }).tap()

    await expect(page.getByText(TOUCH_WALK_HINT)).toBeVisible()
    // The touch scheme advertises none of the desktop controls, because none of
    // them exist here.
    await expect(page.getByText(WALK_HINT)).toHaveCount(0)
    // Pointer lock must never be requested on touch: Android Chrome will grant
    // it, and then every subsequent touch is routed as a locked mouse event and
    // the canvas goes dead.
    expect(await isLocked(page)).toBe(false)
    // And the exit control is the real button, not the Esc badge.
    await expect(page.getByRole('button', { name: /Exit walk mode/ })).toBeVisible()
    await expect(page.getByText(/to release cursor/)).toHaveCount(0)

    expect(errors).toEqual([])
  })

  test('a tap on the ground walks the character there, and they stop', async ({ page }) => {
    const errors = watchForErrors(page)
    await enterTouchWalk(page)

    const before = await walkerPos(page)
    expect(before, 'the harness should expose the walker position').not.toBeNull()

    // Candidate points rather than one fixed point. Where everybody stands comes
    // from the shared wall-clock wander schedule, so any *single* screen point
    // can legitimately land on a buddy (their card opens, nobody walks) or above
    // the horizon (no ground under the ray, deliberately ignored). What must
    // hold is that tapping the island somewhere walks you there.
    let travelled = 0
    for (const [x, y] of GROUND_TAPS) {
      await dismissCard(page)
      await page.touchscreen.tap(x, y)
      await page.waitForTimeout(1600)
      const now = await walkerPos(page)
      travelled = Math.hypot(now!.x - before!.x, now!.z - before!.z)
      if (travelled > 0.5) break
    }
    expect(travelled, 'tapping the ground never moved the character').toBeGreaterThan(0.5)

    // And they come to rest on their own — nobody is holding a key down, and
    // nothing is steering once the destination is reached.
    await expect.poll(async () => {
      const a = await walkerPos(page)
      await page.waitForTimeout(700)
      const b = await walkerPos(page)
      return Math.hypot(a!.x - b!.x, a!.z - b!.z)
    }, { timeout: 30_000 }).toBeLessThan(0.05)

    expect(errors).toEqual([])
  })

  test('a double-tap runs, where a single tap walks', async ({ page }) => {
    const errors = watchForErrors(page)
    await enterTouchWalk(page)

    // Compared by top speed, not distance: both taps aim at the same spot, so
    // the only thing the run changes is how fast they get there.
    //
    // Keep trying points until the trip is long enough to be conclusive. A short
    // hop is uninformative in both directions — the walker brakes before ever
    // reaching cruise — and trips get short exactly when the previous leg
    // happened to end near the next point.
    const topSpeed = async (double: boolean, enough: number) => {
      let best = 0
      for (const [x, y] of [...GROUND_TAPS, ...GROUND_TAPS]) {
        await tapCanvas(page, x, y, double ? 2 : 1)
        best = Math.max(best, await peakSpeed(page, 1400))
        if (best >= enough) break
        await page.waitForTimeout(300)
      }
      return best
    }

    // WALK_SPEED is 2.8 and SPRINT_SPEED 6.4, so a real upgrade is unmistakable.
    // The thresholds sit well clear of both, so this stays a test of "the second
    // tap means run" rather than a test of the tuning constants.
    const walking = await topSpeed(false, 2.5)
    const running = await topSpeed(true, 4.5)

    expect(walking, 'a single tap never got the character walking').toBeGreaterThan(2)
    expect(walking, 'a single tap should not sprint').toBeLessThan(3.2)
    expect(running, 'a double tap did not upgrade to a run').toBeGreaterThan(4)

    expect(errors).toEqual([])
  })

  test('a drag orbits the camera instead of walking', async ({ page }) => {
    const errors = watchForErrors(page)
    await enterTouchWalk(page)
    await walkerAtRest(page)

    const before = await walkerPos(page)
    const frames = []
    for (let i = 0; i <= 10; i++) frames.push([{ id: 1, x: 120 + i * 18, y: 420 }])
    await touchGesture(page, frames)
    await page.waitForTimeout(700)

    const after = await walkerPos(page)
    // A drag past the slop is an orbit, start to finish. It must not also leave
    // a destination behind for the character to wander off to.
    expect(Math.hypot(after!.x - before!.x, after!.z - before!.z)).toBeLessThan(0.05)
    await expect(page.getByText(TOUCH_WALK_HINT)).toBeVisible()
    expect(errors).toEqual([])
  })

  test('survives being driven, and exits back to the plaza', async ({ page }) => {
    const errors = watchForErrors(page)
    await enterTouchWalk(page)

    await page.touchscreen.tap(210, 600)
    await page.waitForTimeout(500)
    await page.touchscreen.tap(120, 520)
    await page.touchscreen.tap(120, 520)          // upgrade to a run
    await page.waitForTimeout(500)

    // Pinch, then a drag, then a tap right on the horizon (a ray that may never
    // meet the ground at all) — the mis-tap path.
    await touchGesture(page, [
      [{ id: 1, x: 150, y: 400 }, { id: 2, x: 270, y: 400 }],
      [{ id: 1, x: 170, y: 400 }, { id: 2, x: 250, y: 400 }],
      [{ id: 1, x: 190, y: 400 }, { id: 2, x: 230, y: 400 }],
    ])
    await touchGesture(page, [
      [{ id: 3, x: 300, y: 300 }],
      [{ id: 3, x: 240, y: 320 }],
      [{ id: 3, x: 180, y: 340 }],
    ])
    await page.touchscreen.tap(210, 5)
    await page.waitForTimeout(600)

    const frames = await page.evaluate(
      () => new Promise<number>((res) => {
        let n = 0
        const t0 = performance.now()
        const tick = () => {
          n++
          if (performance.now() - t0 < 2000) requestAnimationFrame(tick)
          else res(n)
        }
        requestAnimationFrame(tick)
      }),
    )
    expect(frames).toBeGreaterThan(1)

    await expect(page.getByText(TOUCH_WALK_HINT)).toBeVisible()
    await page.getByRole('button', { name: /Exit walk mode/ }).tap()
    await expect(page.getByText(PLAZA_HINT)).toBeVisible()
    expect(errors).toEqual([])
  })

  // Same regression as the desktop case at the top of the file: the plaza fills
  // the viewport and the tab bar is fixed on top of it.
  test('the touch walk controls clear the tab bar', async ({ page }) => {
    await enterTouchWalk(page)
    const bar = await page.locator('nav').boundingBox()
    expect(bar).not.toBeNull()

    for (const [label, box] of [
      ['touch walk hint', await page.getByText(TOUCH_WALK_HINT).boundingBox()],
      ['exit button', await page.getByRole('button', { name: /Exit walk mode/ }).boundingBox()],
    ] as const) {
      expect(box, `${label} should be laid out`).not.toBeNull()
      expect(box!.y + box!.height, `${label} overlaps the tab bar`).toBeLessThanOrEqual(bar!.y)
    }
  })
})
