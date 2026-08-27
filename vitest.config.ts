import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Security-rules tests need the Firestore emulator (a JVM process) running,
    // so they are deliberately kept out of this run — `npm test` stays a
    // couple of seconds with zero infrastructure. Run them with
    // `npm run test:rules`, which boots the emulator around them.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.rules.test.ts'],
    environment: 'node',
  },
})
