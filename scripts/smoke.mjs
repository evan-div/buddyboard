// Landing-page smoke test: builds must already exist (`npm run build`).
// Starts `next start`, opens the landing page in headless Chromium, and
// asserts the login form and cloud backdrop render without console errors.
//
// Browser resolution: CHROME_PATH env var if set, otherwise the machine's
// installed Chrome (GitHub Actions runners ship one).

import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const PORT = process.env.SMOKE_PORT ?? '3100'
const URL = `http://localhost:${PORT}/`

function fail(msg) {
  console.error(`SMOKE FAIL: ${msg}`)
  process.exitCode = 1
}

const server = spawn('npx', ['next', 'start', '-p', PORT], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
})
let serverLog = ''
server.stdout.on('data', (d) => { serverLog += d })
server.stderr.on('data', (d) => { serverLog += d })

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`server did not answer on :${PORT}\n${serverLog}`)
}

let browser
try {
  await waitForServer()

  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    channel: process.env.CHROME_PATH ? undefined : 'chrome',
    // Software GL so the WebGL canvas renders on GPU-less CI machines
    args: ['--use-angle=swiftshader', '--no-sandbox'],
  })
  const page = await browser.newPage()

  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })

  const title = await page.title()
  if (!/buddyboard/i.test(title)) fail(`unexpected title: "${title}"`)

  const hasLogin = await page
    .locator('input[type="email"], input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false)
  if (!hasLogin) fail('login form not visible')

  // The landing background is the pure-CSS cloud backdrop
  const clouds = await page.locator('.cloud-sprite').count()
  if (clouds === 0) fail('cloud backdrop did not render')

  // Firestore/auth network failures are expected with dummy env; real page
  // errors are not.
  const fatal = errors.filter(
    (e) => !/firebase|firestore|auth\/|network|fetch|installations/i.test(e)
  )
  if (fatal.length) fail(`console errors:\n${fatal.join('\n')}`)

  if (process.exitCode !== 1) console.log('SMOKE PASS')
} catch (e) {
  fail(e.message)
} finally {
  await browser?.close().catch(() => {})
  server.kill('SIGTERM')
}
