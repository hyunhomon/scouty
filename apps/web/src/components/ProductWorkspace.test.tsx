import { render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProductWorkspace } from "./ProductWorkspace"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ProductWorkspace", () => {
  it("shows the Google sign-in boundary to an anonymous visitor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname
        if (path === "/v1/auth/session") {
          return new Response(null, { status: 200 })
        }
        if (path === "/v1/discovery/roles") {
          return Response.json([])
        }
        return new Response(null, { status: 404 })
      }),
    )

    render(<ProductWorkspace view="profile" />)

    expect(await screen.findByText("계속하려면 로그인해주세요")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      expect.stringContaining("/v1/auth/google/start?returnTo="),
    )
    expect(screen.queryByRole("button", { name: "로그아웃" })).not.toBeInTheDocument()
  })

  it("offers an explicit publish action after processing completes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname
        if (path === "/v1/auth/session") {
          return Response.json({
            id: "user-1",
            email: "owner@example.com",
            isProfileComplete: true,
          })
        }
        if (path === "/v1/discovery/roles") return Response.json([])
        if (path === "/v1/me") {
          return Response.json({
            avatarUrl: null,
            bio: "제품을 만드는 사람입니다.",
            communicationPreference: null,
            handle: "owner",
            nickname: "오너",
            roles: [],
            scoutStatus: "selective",
            stats: {
              averageResponseSeconds: null,
              mannerEvaluationCount: 0,
              mannerTemperature: 36.5,
              responseCount: 0,
              responseEligibleCount: 0,
              scoutReceivedCount: 0,
              scoutSentCount: 0,
            },
            userId: "user-1",
          })
        }
        if (path === "/v1/me/unread-counts") {
          return Response.json({ chat: 0, requests: 0 })
        }
        if (path === "/v1/me/portfolios") {
          return Response.json([
            {
              hasPendingVideoReplacement: false,
              hasVideo: false,
              id: "portfolio-1",
              publishedAt: null,
              replacementErrorCode: null,
              replacementStatus: null,
              roles: [],
              status: "ready",
              tags: ["핀테크"],
              title: "Scouty",
              videoErrorCode: null,
            },
          ])
        }
        if (path === "/v1/me/bookmarks") return Response.json([])
        return new Response(null, { status: 404 })
      }),
    )

    render(<ProductWorkspace view="profile" />)

    expect(await screen.findByText("게시 준비 완료")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "게시" })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "상세 보기" })).not.toBeInTheDocument()
  })
})
