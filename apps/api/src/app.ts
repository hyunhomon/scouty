import { openapi } from "@elysia/openapi"
import { cors } from "@elysiajs/cors"
import { Elysia, t } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"
import { ApiError, type CoreService, parseSessionToken } from "./core"
import { type CoreRouteOptions, createCoreRoutes } from "./core-routes"
import {
  type DiscoveryRepository,
  decodeDiscoveryCursor,
  getEmptyDiscoveryRepository,
} from "./discovery"
import type { ReadinessResult } from "./readiness"

export type {
  AssetUploadTicket,
  ChatMessage,
  ChatRoomSummary,
  CoreService,
  NotificationSummary,
  PortfolioSummary,
  PortfolioUploadTicket,
  ProfileSummary,
  PublicProfile,
  ScoutCandidate,
  ScoutRequestSummary,
  SessionUser,
} from "./core"
export type {
  DiscoveryPortfolio,
  DiscoveryPortfolioDetail,
  DiscoveryPortfolioPage,
  DiscoveryRole,
  ListDiscoveryPortfoliosInput,
} from "./discovery"

const defaultReadiness: ReadinessResult = {
  status: "degraded",
  checks: { postgres: "error", d1: "error", r2: "error" },
}

const readinessSchema = t.Object({
  status: t.Union([t.Literal("ok"), t.Literal("degraded")]),
  checks: t.Object({
    postgres: t.Union([t.Literal("ok"), t.Literal("error")]),
    d1: t.Union([t.Literal("ok"), t.Literal("error")]),
    r2: t.Union([t.Literal("ok"), t.Literal("error")]),
  }),
})

const discoveryRoleSchema = t.Object({
  groupName: t.String(),
  groupSlug: t.String(),
  name: t.String(),
  slug: t.String(),
})

const discoveryPortfolioSchema = t.Object({
  id: t.String(),
  author: t.Object({
    handle: t.String(),
    id: t.String(),
    nickname: t.String(),
  }),
  coverUrl: t.Union([t.String(), t.Null()]),
  hasVideo: t.Boolean(),
  publishedAt: t.String(),
  roles: t.Array(t.String()),
  tags: t.Array(t.String()),
  title: t.String(),
})

const discoveryPageSchema = t.Object({
  items: t.Array(discoveryPortfolioSchema),
  nextCursor: t.Union([t.String(), t.Null()]),
})

const discoveryPortfolioDetailSchema = t.Object({
  id: t.String(),
  author: t.Object({
    avatarUrl: t.Union([t.String(), t.Null()]),
    bio: t.String(),
    handle: t.String(),
    id: t.String(),
    nickname: t.String(),
    scoutStatus: t.Union([t.Literal("open"), t.Literal("selective"), t.Literal("closed")]),
  }),
  coverUrl: t.Union([t.String(), t.Null()]),
  hasVideo: t.Boolean(),
  otherProjects: t.Array(
    t.Object({
      coverUrl: t.Union([t.String(), t.Null()]),
      id: t.String(),
      publishedAt: t.String(),
      title: t.String(),
    }),
  ),
  pages: t.Array(
    t.Object({
      height: t.Number(),
      imageUrl: t.String(),
      pageNumber: t.Number(),
      width: t.Number(),
    }),
  ),
  publishedAt: t.String(),
  roles: t.Array(t.String()),
  tags: t.Array(t.String()),
  title: t.String(),
  videoUrl: t.Union([t.String(), t.Null()]),
})

const errorSchema = t.Object({
  code: t.String(),
  message: t.String(),
})

export type CreateAppOptions = {
  aot?: boolean
  assets?: R2Bucket
  chatRooms?: DurableObjectNamespace
  cookieDomain?: string
  core?: CoreService
  corsOrigins?: string
  discovery?: DiscoveryRepository
  google?: CoreRouteOptions["google"]
  readiness?: () => Promise<ReadinessResult>
  webOrigin?: string
}

export function parseCorsOrigins(origins = "") {
  return origins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function createApp(options: CreateAppOptions = {}) {
  const discovery = options.discovery ?? getEmptyDiscoveryRepository()
  const readiness = options.readiness ?? (async () => defaultReadiness)

  return new Elysia({ adapter: CloudflareAdapter, aot: options.aot ?? true })
    .onError(({ error, set }) => {
      if (error instanceof ApiError) {
        set.status = error.status
        return { code: error.code, message: error.message }
      }
    })
    .use(
      openapi({
        path: "/docs",
        documentation: {
          info: {
            title: "Scouty API",
            version: "0.1.0",
            description: "결과물로 시작하는 대학생 팀빌딩 서비스 API",
          },
          servers: [{ url: "https://api.greeney.life", description: "Production" }],
          tags: [
            { name: "System", description: "서비스 상태 확인" },
            { name: "Discovery", description: "공개 프로젝트 탐색" },
            { name: "Auth", description: "로그인과 세션" },
            { name: "Profile", description: "프로필" },
            { name: "Portfolio", description: "프로젝트 등록과 관리" },
            { name: "Assets", description: "권한 확인 에셋" },
            { name: "Scout", description: "스카우트 탐색과 제안" },
            { name: "Chat", description: "승인 후 채팅" },
            { name: "Notification", description: "인앱 알림" },
            { name: "Trust", description: "매너, 차단과 신고" },
          ],
        },
      }),
    )
    .use(
      cors({
        credentials: true,
        origin: parseCorsOrigins(options.corsOrigins),
      }),
    )
    .use(
      createCoreRoutes({
        allowedOrigins: parseCorsOrigins(options.corsOrigins),
        assets: options.assets,
        chatRooms: options.chatRooms,
        cookieDomain: options.cookieDomain,
        core: options.core,
        google: options.google,
        webOrigin: options.webOrigin ?? "http://localhost:4321",
      }),
    )
    .get("/", () => ({ name: "scouty-api", status: "ok" }) as const, {
      response: t.Object({ name: t.Literal("scouty-api"), status: t.Literal("ok") }),
      detail: { summary: "API 정보", tags: ["System"] },
    })
    .get("/health", () => ({ status: "ok" as const }), {
      response: t.Object({ status: t.Literal("ok") }),
      detail: { summary: "Liveness 확인", tags: ["System"] },
    })
    .get("/v1/discovery/roles", () => discovery.listRoles(), {
      response: t.Array(discoveryRoleSchema),
      detail: {
        summary: "탐색 역할 목록",
        description: "현재 선택 가능한 역할을 운영 정렬 순서로 반환합니다.",
        tags: ["Discovery"],
      },
    })
    .get(
      "/v1/discovery/portfolios",
      async ({ query, request, status }) => {
        const cursor = query.cursor ? decodeDiscoveryCursor(query.cursor) : undefined

        if (query.cursor && !cursor) {
          return status(400, {
            code: "INVALID_CURSOR",
            message: "유효하지 않은 페이지 커서입니다.",
          })
        }

        const sessionToken = parseSessionToken(request.headers.get("cookie"))
        const sessionUser =
          sessionToken && options.core ? await options.core.resolveSession(sessionToken) : null
        const excludeAuthorIds = sessionUser
          ? await options.core?.listExcludedDiscoveryAuthors(sessionUser.id)
          : undefined

        return discovery.listPortfolios({
          cursor: cursor ?? undefined,
          excludeAuthorIds,
          limit: query.limit ?? 20,
          query: query.q,
          role: query.role,
        })
      },
      {
        query: t.Object({
          cursor: t.Optional(t.String({ maxLength: 512 })),
          limit: t.Optional(t.Number({ maximum: 20, minimum: 1 })),
          q: t.Optional(t.String({ maxLength: 60 })),
          role: t.Optional(t.String({ maxLength: 80, pattern: "^[a-z0-9-]+$" })),
        }),
        response: { 200: discoveryPageSchema, 400: errorSchema },
        detail: {
          summary: "공개 프로젝트 피드",
          description: "역할과 제목·태그 검색 조건으로 게시 프로젝트를 최신순 탐색합니다.",
          tags: ["Discovery"],
        },
      },
    )
    .get(
      "/v1/discovery/portfolios/:portfolioId",
      async ({ params, status }) => {
        const portfolio = await discovery.getPortfolio(params.portfolioId)

        if (!portfolio) {
          return status(404, {
            code: "PORTFOLIO_NOT_FOUND",
            message: "프로젝트를 찾을 수 없습니다.",
          })
        }

        return portfolio
      },
      {
        params: t.Object({
          portfolioId: t.String({ maxLength: 100, minLength: 1 }),
        }),
        response: { 200: discoveryPortfolioDetailSchema, 404: errorSchema },
        detail: {
          summary: "공개 프로젝트 상세",
          description: "프로젝트 메타데이터, 연속 페이지 이미지와 작성자 요약을 반환합니다.",
          tags: ["Discovery"],
        },
      },
    )
    .get(
      "/ready",
      async ({ status }) => {
        const result = await readiness()

        if (result.status !== "ok") {
          return status(503, result)
        }

        return result
      },
      {
        response: { 200: readinessSchema, 503: readinessSchema },
        detail: {
          summary: "Readiness 확인",
          description: "PostgreSQL, D1, R2 바인딩의 준비 상태를 확인합니다.",
          tags: ["System"],
        },
      },
    )
}

export type App = ReturnType<typeof createApp>
