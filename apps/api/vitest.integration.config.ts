import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: "2026-08-06",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
        modulesRules: [
          {
            fallthrough: true,
            include: ["**/*.wasm?module"],
            type: "CompiledWasm",
          },
        ],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./d1/migrations"),
        },
      },
    })),
  ],
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["test-integration/**/*.test.ts"],
    testTimeout: 30_000,
  },
})
