import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'

// Containers and CI images ship a prebuilt Chromium and no GPU. Detect that
// rather than hard-coding it, so `npx playwright install` on a dev machine
// still works with hardware rendering.
const CONTAINER_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const usePrebuilt = fs.existsSync(CONTAINER_CHROMIUM)

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3311)

// Must be "localhost", not "127.0.0.1". Next 16 blocks cross-origin requests to
// dev resources, and it treats the two as different origins — hitting the dev
// server by IP gets the client bundle blocked, so the page server-renders and
// then never hydrates. Everything looks present in the DOM while no effect ever
// runs, which is a deeply confusing way to fail.
const HOST = 'localhost'

export default defineConfig({
  testDir: './e2e',
  // The plaza is a WebGL scene; under software rendering it runs at a couple of
  // frames a second, so anything waiting on a rendered frame needs headroom.
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: usePrebuilt ? CONTAINER_CHROMIUM : undefined,
      args: usePrebuilt
        ? ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
        : [],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://${HOST}:${PORT}/walkharness`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // The harness mounts MiiPlaza, which imports the Firebase SDK at module
      // scope. These are placeholders so initialization doesn't throw — the
      // walk-mode paths under test never touch the network.
      NEXT_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test',
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '0',
      NEXT_PUBLIC_FIREBASE_APP_ID: '1:0:web:test',
    },
  },
})
