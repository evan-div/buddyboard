import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Security-rules tests only. These talk to the Firestore emulator rather than
// mocking it, so they cannot run in the default suite — see vitest.config.ts.
// Driven by `npm run test:rules`, which wraps this in `firebase emulators:exec`.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.rules.test.ts'],
    environment: 'node',
    // Rules tests share one emulator project and clear it between cases, so
    // they must not run concurrently with each other.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
})
