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

  it("includes the session cookie for authenticated API uploads", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    await uploadFile(
      "https://api.greeney.life/v1/me/uploads/asset-1",
      new File(["image"], "avatar.png", { type: "image/png" }),
      { "content-type": "image/png" },
      "프로필 이미지",
    )

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.greeney.life/v1/me/uploads/asset-1",
      expect.objectContaining({ credentials: "include", method: "PUT" }),
    )
  })

  it("splits large files into authenticated multipart uploads", async () => {
    const completedBodies: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/multipart") && init?.method === "POST") {
        return Response.json({ uploadId: "upload-1" })
      }
      if (url.endsWith("/multipart/complete")) {
        completedBodies.push(String(init?.body))
        return new Response(null, { status: 204 })
      }
      if (init?.method === "PUT") {
        const partNumber = Number(new URL(url).searchParams.get("partNumber"))
        return Response.json({ etag: `etag-${partNumber}`, partNumber })
      }
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal("fetch", fetchMock)
    const file = new File(["video"], "showreel.mp4", { type: "video/mp4" })
    Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 + 1 })
    const slice = vi.spyOn(file, "slice").mockReturnValue(new Blob(["part"]))

    await uploadFile(
      "https://api.greeney.life/v1/me/uploads/asset-1",
      file,
      { "content-type": "video/mp4" },
      "영상",
    )

    expect(slice).toHaveBeenCalledTimes(6)
    expect(completedBodies).toHaveLength(1)
    expect(JSON.parse(completedBodies[0] ?? "{}").parts).toHaveLength(6)
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.greeney.life/v1/me/uploads/asset-1/multipart",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    )
  })
})
