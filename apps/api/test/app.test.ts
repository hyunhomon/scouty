import { describe, expect, it, vi } from "vitest"
import { type CoreService, createApp, parseCorsOrigins } from "../src/app"

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
        checks: {
          d1: "error",
          r2: "ok",
          oauth: "ok",
          r2Signing: "ok",
          queue: "ok",
        },
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

describe("OpenAPI reference", () => {
  it("serves the Scalar documentation UI", async () => {
    const app = createApp({ aot: false })
    const response = await app.handle(new Request("https://scouty.test/docs"))

    expect(response.status).toBe(200)
    expect(await response.text()).toContain("Scouty API")
  })

  it("publishes the health endpoints in the OpenAPI document", async () => {
    const app = createApp({ aot: false })
    const response = await app.handle(new Request("https://scouty.test/docs/json"))
    const specification = (await response.json()) as { paths: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(specification.paths).toHaveProperty("/health")
    expect(specification.paths).toHaveProperty("/ready")
    expect(specification.paths).toHaveProperty("/v1/auth/google/start")
    expect(specification.paths).toHaveProperty("/v1/scout/requests")
    expect(specification.paths).toHaveProperty("/v1/chat/rooms/{id}/messages")
    expect(specification.paths).toHaveProperty("/v1/me/unread-counts")
    expect(specification.paths).toHaveProperty("/v1/me/account")
    expect(specification.paths).toHaveProperty("/v1/me/portfolios/{id}/uploads")
    expect(specification.paths).toHaveProperty("/v1/me/uploads/{id}")
    expect(specification.paths).toHaveProperty("/v1/me/uploads/{id}/multipart")
    expect(specification.paths).toHaveProperty("/v1/analytics/events")
  })
})

describe("API security boundary", () => {
  it("serializes an anonymous session as JSON null", async () => {
    const app = createApp({ aot: false })
    const response = await app.handle(new Request("https://scouty.test/v1/auth/session"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    await expect(response.json()).resolves.toBeNull()
  })

  it("rejects protected routes without a session", async () => {
    const app = createApp({ aot: false })
    const response = await app.handle(new Request("https://scouty.test/v1/me"))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_REQUIRED",
      message: "로그인이 필요해요.",
    })
  })

  it("rejects a cross-origin mutation before touching application state", async () => {
    const app = createApp({ aot: false, corsOrigins: "https://greeney.life" })
    const response = await app.handle(
      new Request("https://scouty.test/v1/auth/logout", {
        headers: { origin: "https://attacker.test" },
        method: "POST",
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_ORIGIN" })
  })

  it("passes an authenticated upload stream to the core service", async () => {
    const uploadAsset = vi.fn(async () => undefined)
    const core = {
      resolveSession: vi.fn(async () => ({
        email: "maker@example.com",
        id: "user-1",
        isProfileComplete: true,
      })),
      uploadAsset,
    } as unknown as CoreService
    const app = createApp({
      aot: false,
      core,
      corsOrigins: "https://greeney.life",
    })
    const response = await app.handle(
      new Request("https://api.greeney.life/v1/me/uploads/asset-1", {
        body: new Blob(["test"], { type: "image/png" }),
        headers: {
          "content-type": "image/png",
          cookie: "scouty_session=session-token",
          origin: "https://greeney.life",
        },
        method: "PUT",
      }),
    )

    expect(response.status).toBe(204)
    expect(uploadAsset).toHaveBeenCalledWith("user-1", "asset-1", expect.anything(), "image/png")
  })
})
