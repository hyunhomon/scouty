import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app"
import {
  type DiscoveryPortfolioDetail,
  type DiscoveryRepository,
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
} from "../src/discovery"

const portfolio = {
  id: "portfolio-1",
  author: {
    handle: "minji",
    id: "user-1",
    nickname: "민지",
  },
  coverUrl: "https://assets.scouty.test/portfolio-1/cover.webp",
  hasVideo: true,
  publishedAt: "2026-08-06T12:00:00.000Z",
  roles: ["ui-ux-design"],
  tags: ["핀테크", "모바일"],
  title: "대학생 금융 습관 서비스",
}

const portfolioDetail: DiscoveryPortfolioDetail = {
  ...portfolio,
  author: {
    ...portfolio.author,
    avatarUrl: "https://assets.scouty.test/users/user-1/avatar.webp",
    bio: "사용자의 문제를 관찰하고 화면으로 풀어요.",
    scoutStatus: "selective",
  },
  otherProjects: [],
  pages: [
    {
      height: 1600,
      imageUrl: "https://assets.scouty.test/portfolio-1/pages/1.webp",
      pageNumber: 1,
      width: 1200,
    },
  ],
  videoUrl: "https://assets.scouty.test/portfolio-1/video.mp4",
}

function createDiscoveryRepository(
  detail: DiscoveryPortfolioDetail | null = portfolioDetail,
): DiscoveryRepository {
  return {
    getPortfolio: vi.fn(async () => detail),
    listRoles: vi.fn(async () => [
      {
        groupName: "디자인",
        groupSlug: "design",
        name: "UI·UX 디자인",
        slug: "ui-ux-design",
      },
    ]),
    listPortfolios: vi.fn(async () => ({ items: [portfolio], nextCursor: null })),
  }
}

describe("Discovery cursor", () => {
  it("round-trips the keyset position", () => {
    const cursor = {
      portfolioId: portfolio.id,
      publishedAt: portfolio.publishedAt,
    }

    expect(decodeDiscoveryCursor(encodeDiscoveryCursor(cursor))).toEqual(cursor)
  })

  it("rejects malformed values", () => {
    expect(decodeDiscoveryCursor("not-a-cursor")).toBeNull()
  })
})

describe("Discovery API", () => {
  it("returns the active role catalog", async () => {
    const app = createApp({ aot: false, discovery: createDiscoveryRepository() })
    const response = await app.handle(new Request("https://scouty.test/v1/discovery/roles"))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        groupName: "디자인",
        groupSlug: "design",
        name: "UI·UX 디자인",
        slug: "ui-ux-design",
      },
    ])
  })

  it("passes normalized feed filters to the repository", async () => {
    const discovery = createDiscoveryRepository()
    const app = createApp({ aot: false, discovery })
    const response = await app.handle(
      new Request(
        "https://scouty.test/v1/discovery/portfolios?role=ui-ux-design&q=%ED%95%80%ED%85%8C%ED%81%AC&limit=12",
      ),
    )

    expect(response.status).toBe(200)
    expect(discovery.listPortfolios).toHaveBeenCalledWith({
      cursor: undefined,
      limit: 12,
      query: "핀테크",
      role: "ui-ux-design",
    })
    await expect(response.json()).resolves.toEqual({ items: [portfolio], nextCursor: null })
  })

  it("rejects an invalid cursor without querying the repository", async () => {
    const discovery = createDiscoveryRepository()
    const app = createApp({ aot: false, discovery })
    const response = await app.handle(
      new Request("https://scouty.test/v1/discovery/portfolios?cursor=invalid"),
    )

    expect(response.status).toBe(400)
    expect(discovery.listPortfolios).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      code: "INVALID_CURSOR",
      message: "유효하지 않은 페이지 커서입니다.",
    })
  })

  it("returns a project with its ordered page images", async () => {
    const discovery = createDiscoveryRepository()
    const app = createApp({ aot: false, discovery })
    const response = await app.handle(
      new Request("https://scouty.test/v1/discovery/portfolios/portfolio-1"),
    )

    expect(response.status).toBe(200)
    expect(discovery.getPortfolio).toHaveBeenCalledWith("portfolio-1")
    await expect(response.json()).resolves.toEqual(portfolioDetail)
  })

  it("uses a stable not-found response for hidden or missing projects", async () => {
    const app = createApp({ aot: false, discovery: createDiscoveryRepository(null) })
    const response = await app.handle(
      new Request("https://scouty.test/v1/discovery/portfolios/missing"),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      code: "PORTFOLIO_NOT_FOUND",
      message: "프로젝트를 찾을 수 없습니다.",
    })
  })
})
