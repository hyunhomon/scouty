import { describe, expect, it, vi } from "vitest"
import { createApp } from "../src/app"
import {
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

function createDiscoveryRepository(): DiscoveryRepository {
  return {
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
})
