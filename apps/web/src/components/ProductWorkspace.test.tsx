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
          return Response.json(null)
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
})
