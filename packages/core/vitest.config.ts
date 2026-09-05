import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integration tests need DATABASE_URL; they self-skip when it is missing.
    testTimeout: 20_000,
  },
});
