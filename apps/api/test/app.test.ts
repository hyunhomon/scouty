import { describe, expect, it } from "vitest"
import { createApp, parseCorsOrigins } from "../src/app"

describe("API health", () => {
  it("reports liveness", async () => {
    const app = createApp({ aot: false })
    const response = await app.handle(new Request("https://scouty.test/health"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: "ok" })
  })

  it("uses 503 for failed dependencies", async () => {
    const app = createApp({
      aot: false,
      readiness: async () => ({
        status: "degraded",
        checks: { postgres: "ok", d1: "error", r2: "ok" },
      }),
    })
    const response = await app.handle(new Request("https://scouty.test/ready"))

    expect(response.status).toBe(503)
  })
})

describe("CORS origin parsing", () => {
  it("normalizes a comma-separated allowlist", () => {
    expect(parseCorsOrigins("https://scouty.kr, http://localhost:4321 ")).toEqual([
      "https://scouty.kr",
      "http://localhost:4321",
    ])
  })
})
