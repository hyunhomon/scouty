import type { Page, Route } from "@playwright/test"

const apiOrigin = "https://api.greeney.life"

export const roles = [
  { groupName: "개발", groupSlug: "development", name: "백엔드", slug: "backend" },
  { groupName: "개발", groupSlug: "development", name: "프론트엔드", slug: "frontend" },
  { groupName: "디자인", groupSlug: "design", name: "프로덕트 디자인", slug: "product-design" },
  { groupName: "기획", groupSlug: "product", name: "프로덕트 매니저", slug: "product-manager" },
  { groupName: "마케팅", groupSlug: "marketing", name: "콘텐츠 마케팅", slug: "content-marketing" },
]

const now = "2026-08-07T00:00:00.000Z"

export const portfolios = Array.from({ length: 5 }, (_, index) => ({
  author: {
    handle: `maker-${index + 1}`,
    id: `author-${index + 1}`,
    nickname: `메이커 ${index + 1}`,
  },
  coverUrl: null,
  hasVideo: index === 0,
  id: `portfolio-${index + 1}`,
  publishedAt: now,
  roles: [roles[index]?.slug ?? "backend"],
  tags: ["팀빌딩", `프로젝트${index + 1}`],
  title: `실전 프로젝트 ${index + 1}`,
}))

export const profile = {
  avatarUrl: null,
  bio: "제품을 끝까지 만드는 개발자입니다.",
  communicationPreference: "메시지로 편하게 이야기해주세요.",
  handle: "scouty-user",
  nickname: "스카우티",
  roles: [{ name: "백엔드", slug: "backend" }],
  scoutStatus: "open",
  stats: {
    averageResponseSeconds: null,
    mannerEvaluationCount: 0,
    mannerTemperature: 36.5,
    responseCount: 0,
    responseEligibleCount: 0,
    scoutReceivedCount: 1,
    scoutSentCount: 1,
  },
  userId: "user-1",
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    headers: {
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": "http://localhost:14321",
    },
    status,
  })
}

export async function mockSignedOutApi(page: Page) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === "/v1/auth/session") return json(route, null)
    if (url.pathname === "/v1/analytics/events") return json(route, { ok: true })
    return json(route, { code: "NOT_FOUND", message: "Not found" }, 404)
  })
}

export async function mockPublicApi(page: Page) {
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === "/v1/analytics/events") return json(route, { ok: true })
    if (url.pathname === "/v1/discovery/roles") return json(route, roles)
    if (url.pathname === "/v1/discovery/portfolios") {
      const selectedRole = url.searchParams.get("role")
      const query = url.searchParams.get("q")?.toLocaleLowerCase("ko-KR")
      const items = portfolios.filter(
        (portfolio) =>
          (!selectedRole || portfolio.roles.includes(selectedRole)) &&
          (!query || portfolio.title.toLocaleLowerCase("ko-KR").includes(query)),
      )
      return json(route, { items, nextCursor: null })
    }
    if (url.pathname === "/v1/discovery/portfolios/portfolio-1") {
      return json(route, {
        ...portfolios[0],
        author: {
          avatarUrl: null,
          bio: "실제 결과물로 협업하는 메이커입니다.",
          handle: "maker-1",
          id: "author-1",
          nickname: "메이커 1",
          scoutStatus: "open",
        },
        otherProjects: [],
        pages: [
          {
            height: 1200,
            imageUrl:
              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1200'%3E%3Crect width='100%25' height='100%25' fill='%23eeeafc'/%3E%3C/svg%3E",
            pageNumber: 1,
            width: 900,
          },
        ],
        videoUrl: null,
      })
    }
    if (url.pathname === "/v1/me/bookmarks") return json(route, [], 401)
    if (url.pathname === "/ready") {
      return json(route, {
        checks: { d1: "ok", oauth: "ok", postgres: "ok", queue: "ok", r2: "ok", r2Signing: "ok" },
        status: "ok",
      })
    }
    return json(route, { code: "NOT_FOUND", message: "Not found" }, 404)
  })
}

export async function mockAuthenticatedApi(page: Page) {
  let canReview = true
  const room = {
    canReview,
    id: "room-1",
    isReadOnly: false,
    lastMessage: { body: "함께 이야기해봐요.", createdAt: now, type: "text" },
    scoutContext: { portfolioTitle: "실전 프로젝트 1", requestId: "request-1", roleName: "백엔드" },
    unreadCount: 1,
    user: { handle: "maker-1", isDeleted: false, nickname: "메이커 1", userId: "user-2" },
  }
  const messages = [
    {
      assetUrl: null,
      body: "함께 이야기해봐요.",
      createdAt: now,
      id: "message-1",
      isMine: false,
      type: "text",
    },
  ]

  await page.routeWebSocket(`${apiOrigin.replace("https", "wss")}/**`, (socket) => {
    socket.onMessage(() => undefined)
  })
  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const path = url.pathname

    if (path === "/v1/analytics/events") return json(route, { ok: true })
    if (path === "/v1/auth/session") {
      return json(route, { email: "user@example.com", id: "user-1", isProfileComplete: true })
    }
    if (path === "/v1/discovery/roles") return json(route, roles)
    if (path === "/v1/me") return json(route, profile)
    if (path === "/v1/me/unread-counts") return json(route, { chat: 1, requests: 1 })
    if (path === "/v1/me/portfolios" || path === "/v1/me/bookmarks") return json(route, [])
    if (path === "/v1/scout/requests" && method === "GET") {
      return json(route, [
        {
          createdAt: now,
          direction: "received",
          id: "request-1",
          isUnread: true,
          projectSummary: "검증된 결과물을 함께 확장하고 싶어요.",
          projectTitle: "새로운 팀 프로젝트",
          requestedRole: { name: "백엔드", slug: "backend" },
          sourcePortfolio: { id: "portfolio-1", title: "실전 프로젝트 1" },
          status: "pending",
          user: { handle: "maker-1", isDeleted: false, nickname: "메이커 1", userId: "user-2" },
        },
      ])
    }
    if (path === "/v1/scout/requests/request-1/accept" && method === "POST") {
      return json(route, { chatRoomId: "room-1", status: "accepted" })
    }
    if (path === "/v1/chat/rooms") return json(route, [{ ...room, canReview }])
    if (path === "/v1/chat/rooms/room-1/messages" && method === "GET") {
      return json(route, { cursor: "cursor-1", hasMore: false, items: messages })
    }
    if (path === "/v1/chat/rooms/room-1/messages" && method === "POST") {
      const body = request.postDataJSON() as { body: string }
      const created = {
        assetUrl: null,
        body: body.body,
        createdAt: "2026-08-07T00:01:00.000Z",
        id: "message-2",
        isMine: true,
        type: "text",
      }
      messages.push(created)
      return json(route, created)
    }
    if (path === "/v1/scout/requests/request-1/manner" && method === "POST") {
      canReview = false
      return json(route, { ok: true })
    }
    if (path === "/v1/trust/blocks" || path === "/v1/trust/reports") {
      return json(route, { ok: true })
    }
    return json(route, { code: "NOT_FOUND", message: `Unhandled ${method} ${path}` }, 404)
  })
}
