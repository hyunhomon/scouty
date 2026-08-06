import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@scouty/db": fileURLToPath(new URL("../../packages/db/src/node.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["test-integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
})
