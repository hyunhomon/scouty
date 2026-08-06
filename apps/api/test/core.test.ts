import { describe, expect, it } from "vitest"
import {
  type ApiError,
  calculateMannerTemperature,
  clearSessionCookie,
  createSessionCookie,
  hasExpectedFileSignature,
  isAllowedReturnPath,
  isValidHandle,
  normalizeHandle,
  normalizeTags,
  parseSessionToken,
} from "../src/core"
import { createGoogleAuthorizationUrl, createOAuthState, verifyOAuthState } from "../src/security"

describe("core normalization", () => {
  it("normalizes handles and validates the public format", () => {
    expect(normalizeHandle("  Scouty_User ")).toBe("scouty_user")
    expect(isValidHandle("scouty_user")).toBe(true)
    expect(isValidHandle("Scouty-user")).toBe(false)
  })

  it("normalizes, de-duplicates, and bounds tags", () => {
    expect(normalizeTags(["#Design", " design ", "UX", "x", "a".repeat(21)])).toEqual([
      "design",
      "ux",
    ])
  })

  it("applies the version-one manner formula", () => {
    expect(calculateMannerTemperature(0, 0)).toBe(36.5)
    expect(calculateMannerTemperature(1, 0)).toBe(38.8)
    expect(calculateMannerTemperature(0, 1)).toBe(34.3)
  })
})

describe("uploaded file signatures", () => {
  it("accepts the supported image, PDF, and video signatures", () => {
    expect(hasExpectedFileSignature("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(
      true,
    )
    expect(hasExpectedFileSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      true,
    )
    expect(
      hasExpectedFileSignature(
        "image/png",
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      ),
    ).toBe(true)
    expect(hasExpectedFileSignature("image/webp", new TextEncoder().encode("RIFF0000WEBP"))).toBe(
      true,
    )
    expect(hasExpectedFileSignature("video/mp4", new TextEncoder().encode("0000ftypisom"))).toBe(
      true,
    )
    expect(hasExpectedFileSignature("video/webm", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))).toBe(
      true,
    )
  })

  it("rejects a spoofed content type", () => {
    expect(hasExpectedFileSignature("application/pdf", new TextEncoder().encode("not a PDF"))).toBe(
      false,
    )
  })
})

describe("session and OAuth security", () => {
  it("accepts only same-site relative return paths", () => {
    expect(isAllowedReturnPath("/scout?role=backend")).toBe("/scout?role=backend")
    expect(isAllowedReturnPath("//attacker.test")).toBe("/feed")
    expect(isAllowedReturnPath("/\\attacker.test")).toBe("/feed")
    expect(isAllowedReturnPath("https://attacker.test")).toBe("/feed")
  })

  it("round-trips a signed OAuth state and rejects tampering", async () => {
    const state = await createOAuthState("test-secret", "/requests")
    await expect(verifyOAuthState(state, "test-secret")).resolves.toEqual({
      returnTo: "/requests",
    })

    const tampered = `${state.slice(0, -1)}${state.endsWith("a") ? "b" : "a"}`
    await expect(verifyOAuthState(tampered, "test-secret")).rejects.toMatchObject({
      code: "INVALID_OAUTH_STATE",
      status: 400,
    } satisfies Partial<ApiError>)
  })

  it("builds the Google authorization request with the signed state", () => {
    const url = new URL(
      createGoogleAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "https://api.greeney.life/v1/auth/google/callback",
        state: "signed-state",
      }),
    )

    expect(url.origin).toBe("https://accounts.google.com")
    expect(url.searchParams.get("client_id")).toBe("client-id")
    expect(url.searchParams.get("scope")).toBe("openid email")
    expect(url.searchParams.get("state")).toBe("signed-state")
  })

  it("uses an HttpOnly production cookie and can clear it", () => {
    const expiresAt = new Date("2026-08-08T00:00:00.000Z")
    const cookie = createSessionCookie("token value", expiresAt, ".greeney.life")

    expect(cookie).toContain("scouty_session=token%20value")
    expect(cookie).toContain("Domain=.greeney.life")
    expect(cookie).toContain("HttpOnly")
    expect(cookie).toContain("Secure")
    expect(cookie).toContain("SameSite=Lax")
    expect(parseSessionToken(cookie)).toBe("token value")
    expect(clearSessionCookie(".greeney.life")).toContain("Max-Age=0")
  })
})
