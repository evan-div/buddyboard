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

  test('is not offered on a touch-sized viewport', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 860 })
    await page.goto('/walkharness')
    await expect(page.locator('canvas')).toBeVisible()
    // The mobile hint proves the plaza itself rendered, so the missing walk
    // button is a real gate rather than a page that never loaded.
    await expect(page.getByText(/Pinch to zoom/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Walk mode/ })).toHaveCount(0)
  })
})
