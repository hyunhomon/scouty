import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiRequestError, request, uploadFile } from "./api-client"

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("request", () => {
  it("retries transient GET network failures", async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json({ status: "ok" }))
    vi.stubGlobal("fetch", fetchMock)

    const resultPromise = request<{ status: string }>("/health")
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toEqual({ status: "ok" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("does not retry mutations", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    vi.stubGlobal("fetch", fetchMock)

    await expect(request("/v1/me/profile", { method: "PUT" })).rejects.toBeInstanceOf(
      ApiRequestError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("accepts an empty successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    )

    await expect(request("/v1/auth/session")).resolves.toBeNull()
  })

  it("normalizes file upload network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

    await expect(
      uploadFile("https://upload.example.com", new File(["pdf"], "portfolio.pdf"), {}, "PDF"),
    ).rejects.toThrow("PDF 업로드 서버에 연결하지 못했어요")
  })
})
