import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DiscoveryFeed, type DiscoveryFeedClient } from "./DiscoveryFeed"

const roles = [
  {
    groupName: "디자인",
    groupSlug: "design",
    name: "UI·UX 디자인",
    slug: "ui-ux-design",
  },
]

const portfolio = {
  id: "portfolio-1",
  author: { handle: "minji", id: "user-1", nickname: "민지" },
  coverUrl: null,
  hasVideo: true,
  publishedAt: "2026-08-06T12:00:00.000Z",
  roles: ["ui-ux-design"],
  tags: ["핀테크", "모바일"],
  title: "대학생 금융 습관 서비스",
}

function createClient(
  listPortfolios: DiscoveryFeedClient["listPortfolios"] = async () => ({
    items: [portfolio],
    nextCursor: null,
  }),
): DiscoveryFeedClient {
  return {
    listPortfolios,
    listRoles: async () => roles,
  }
}

describe("DiscoveryFeed", () => {
  it("renders projects with human-readable roles", async () => {
    render(<DiscoveryFeed client={createClient()} />)

    expect(await screen.findByText("대학생 금융 습관 서비스")).toBeInTheDocument()
    expect(screen.getByText("민지 · @minji")).toBeInTheDocument()
    expect(screen.getAllByText("UI·UX 디자인").length).toBeGreaterThan(0)
    expect(screen.getByText("#핀테크")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /대학생 금융 습관 서비스/ })).toHaveAttribute(
      "href",
      "/portfolio?portfolio=portfolio-1",
    )
  })

  it("reloads the feed when a role is selected", async () => {
    const listPortfolios = vi.fn<DiscoveryFeedClient["listPortfolios"]>(async ({ role }) => ({
      items: role ? [] : [portfolio],
      nextCursor: null,
    }))
    render(<DiscoveryFeed client={createClient(listPortfolios)} />)

    await screen.findByText("대학생 금융 습관 서비스")
    fireEvent.click(await screen.findByRole("button", { name: "UI·UX 디자인" }))

    await waitFor(() =>
      expect(listPortfolios).toHaveBeenLastCalledWith({
        query: undefined,
        role: "ui-ux-design",
      }),
    )
    expect(await screen.findByText("조건에 맞는 프로젝트가 아직 없어요")).toBeInTheDocument()
  })

  it("offers a retry after a feed request fails", async () => {
    const listPortfolios = vi
      .fn<DiscoveryFeedClient["listPortfolios"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [portfolio], nextCursor: null })
    render(<DiscoveryFeed client={createClient(listPortfolios)} />)

    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }))

    expect(await screen.findByText("대학생 금융 습관 서비스")).toBeInTheDocument()
  })
})
