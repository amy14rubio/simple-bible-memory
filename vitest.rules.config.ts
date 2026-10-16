import { defineConfig } from 'vitest/config';

// Security-rules tests need the Firestore emulator, so they run through `npm run test:rules`, not `npm test`.
export default defineConfig({
  test: { include: ['rules-tests/**/*.test.ts'], fileParallelism: false, testTimeout: 20_000 },
});
