import { Elysia, t } from "elysia"
import {
  ApiError,
  type CoreService,
  clearSessionCookie,
  createSessionCookie,
  parseSessionToken,
} from "./core"
import {
  createGoogleAuthorizationUrl,
  createOAuthState,
  exchangeGoogleCode,
  verifyOAuthState,
} from "./security"

export type CoreRouteOptions = {
  allowedOrigins: string[]
  assets?: R2Bucket | undefined
  chatRooms?: DurableObjectNamespace | undefined
  cookieDomain?: string | undefined
  core?: CoreService | undefined
  google?:
    | {
        clientId: string
        clientSecret: string
        redirectUri: string
        stateSecret: string
      }
    | undefined
  webOrigin: string
}

const idParams = t.Object({ id: t.String({ maxLength: 100, minLength: 1 }) })

const profileInput = t.Object({
  avatarAssetId: t.Optional(t.Union([t.String(), t.Null()])),
  bio: t.String({ maxLength: 160, minLength: 1 }),
  communicationPreference: t.Optional(t.Union([t.String({ maxLength: 60 }), t.Null()])),
  handle: t.String({ maxLength: 20, minLength: 3 }),
  nickname: t.String({ maxLength: 20, minLength: 2 }),
  roleSlugs: t.Array(t.String({ maxLength: 40 }), { maxItems: 3, minItems: 1 }),
  scoutStatus: t.Union([t.Literal("open"), t.Literal("selective"), t.Literal("closed")]),
})

const imageUploadInput = t.Object({
  byteSize: t.Number({ maximum: 5 * 1024 * 1024, minimum: 1 }),
  mimeType: t.Union([t.Literal("image/jpeg"), t.Literal("image/png"), t.Literal("image/webp")]),
})

const portfolioInput = t.Object({
  pdf: t.Object({
    byteSize: t.Number({ maximum: 50 * 1024 * 1024, minimum: 1 }),
    mimeType: t.Literal("application/pdf"),
  }),
  roleSlugs: t.Array(t.String({ maxLength: 40 }), { maxItems: 3, minItems: 1 }),
  tags: t.Array(t.String({ maxLength: 21 }), { maxItems: 5, minItems: 1 }),
  title: t.String({ maxLength: 60, minLength: 1 }),
  video: t.Optional(
    t.Object({
      byteSize: t.Number({ maximum: 200 * 1024 * 1024, minimum: 1 }),
      durationSeconds: t.Number({ maximum: 180, minimum: 1 }),
      mimeType: t.Union([
        t.Literal("video/mp4"),
        t.Literal("video/webm"),
        t.Literal("video/quicktime"),
      ]),
    }),
  ),
})

const pdfUploadInput = t.Object({
  byteSize: t.Number({ maximum: 50 * 1024 * 1024, minimum: 1 }),
  mimeType: t.Literal("application/pdf"),
})

const videoUploadInput = t.Object({
  byteSize: t.Number({ maximum: 200 * 1024 * 1024, minimum: 1 }),
  durationSeconds: t.Number({ maximum: 180, minimum: 1 }),
  mimeType: t.Union([
    t.Literal("video/mp4"),
    t.Literal("video/webm"),
    t.Literal("video/quicktime"),
  ]),
})

function getCore(options: CoreRouteOptions) {
  if (!options.core) {
    throw new ApiError(503, "DATABASE_UNAVAILABLE", "데이터베이스 연결을 준비하고 있어요.")
  }
  return options.core
}

function assertRequestOrigin(request: Request, options: CoreRouteOptions) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return
  const origin = request.headers.get("origin")
  if (origin && !options.allowedOrigins.includes(origin)) {
    throw new ApiError(403, "INVALID_ORIGIN", "허용되지 않은 요청 출처예요.")
  }
}

async function requireUser(request: Request, options: CoreRouteOptions) {
  assertRequestOrigin(request, options)
  const token = parseSessionToken(request.headers.get("cookie"))
  const user = token ? await getCore(options).resolveSession(token) : null
  if (!user) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "로그인이 필요해요.")
  return user
}

export function createCoreRoutes(options: CoreRouteOptions) {
  return new Elysia({ name: "core-routes" })
    .onError(({ error, set }) => {
      if (error instanceof ApiError) {
        set.status = error.status
        return { code: error.code, message: error.message }
      }
    })
    .get(
      "/v1/auth/google/start",
      async ({ query }) => {
        if (!options.google) {
          throw new ApiError(503, "OAUTH_UNAVAILABLE", "로그인 설정을 준비하고 있어요.")
        }
        const state = await createOAuthState(options.google.stateSecret, query.returnTo)
        return Response.redirect(
          createGoogleAuthorizationUrl({
            clientId: options.google.clientId,
            redirectUri: options.google.redirectUri,
            state,
          }),
          302,
        )
      },
      {
        query: t.Object({ returnTo: t.Optional(t.String({ maxLength: 200 })) }),
        detail: { summary: "Google 로그인 시작", tags: ["Auth"] },
      },
    )
    .get(
      "/v1/auth/google/callback",
      async ({ query }) => {
        if (!options.google) {
          throw new ApiError(503, "OAUTH_UNAVAILABLE", "로그인 설정을 준비하고 있어요.")
        }
        const state = await verifyOAuthState(query.state, options.google.stateSecret)
        const googleUser = await exchangeGoogleCode({
          clientId: options.google.clientId,
          clientSecret: options.google.clientSecret,
          code: query.code,
          redirectUri: options.google.redirectUri,
        })
        const user = await getCore(options).signInWithOAuth({ provider: "google", ...googleUser })
        const session = await getCore(options).createSession(user.id)
        const destination = user.isProfileComplete ? state.returnTo : "/onboarding"
        return new Response(null, {
          headers: {
            location: new URL(destination, options.webOrigin).toString(),
            "set-cookie": createSessionCookie(
              session.token,
              session.expiresAt,
              options.cookieDomain,
            ),
          },
          status: 302,
        })
      },
      {
        query: t.Object({ code: t.String({ minLength: 1 }), state: t.String({ minLength: 1 }) }),
        detail: { summary: "Google 로그인 완료", tags: ["Auth"] },
      },
    )
    .get(
      "/v1/auth/session",
      async ({ request }) => {
        const token = parseSessionToken(request.headers.get("cookie"))
        const session = token ? await getCore(options).resolveSession(token) : null
        return Response.json(session)
      },
      { detail: { summary: "현재 로그인 세션", tags: ["Auth"] } },
    )
    .post(
      "/v1/auth/logout",
      async ({ request, set }) => {
        assertRequestOrigin(request, options)
        const token = parseSessionToken(request.headers.get("cookie"))
        if (token) await getCore(options).deleteSession(token)
        set.headers["set-cookie"] = clearSessionCookie(options.cookieDomain)
        return { ok: true }
      },
      { detail: { summary: "로그아웃", tags: ["Auth"] } },
    )
    .post(
      "/v1/analytics/events",
      async ({ body, request }) => {
        assertRequestOrigin(request, options)
        await getCore(options).trackProductEvent(body.name)
        return { ok: true }
      },
      {
        body: t.Object({
          name: t.Union([
            t.Literal("feed_viewed"),
            t.Literal("portfolio_viewed"),
            t.Literal("profile_viewed"),
          ]),
        }),
        detail: { summary: "익명 제품 이벤트", tags: ["Analytics"] },
      },
    )
    .get(
      "/v1/me",
      async ({ request }) => {
        const user = await requireUser(request, options)
        return getCore(options).getMe(user.id)
      },
      { detail: { summary: "내 프로필", tags: ["Profile"] } },
    )
    .get(
      "/v1/me/unread-counts",
      async ({ request }) => {
        const user = await requireUser(request, options)
        return getCore(options).getUnreadCounts(user.id)
      },
      { detail: { summary: "제안·채팅 읽지 않음", tags: ["Profile"] } },
    )
    .delete(
      "/v1/me/account",
      async ({ request, set }) => {
        const user = await requireUser(request, options)
        await getCore(options).deleteAccount(user.id)
        set.headers["set-cookie"] = clearSessionCookie(options.cookieDomain)
        return { ok: true }
      },
      { detail: { summary: "계정 삭제", tags: ["Profile"] } },
    )
    .put(
      "/v1/me/profile",
      async ({ body, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).updateProfile(user.id, body)
      },
      { body: profileInput, detail: { summary: "프로필 완성·수정", tags: ["Profile"] } },
    )
    .post(
      "/v1/me/avatar/uploads",
      async ({ body, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).createAvatarUpload(user.id, body)
      },
      { body: imageUploadInput, detail: { summary: "아바타 업로드 URL", tags: ["Profile"] } },
    )
    .post(
      "/v1/me/avatar/uploads/:id/complete",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).confirmAvatarUpload(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "아바타 업로드 완료", tags: ["Profile"] } },
    )
    .get("/v1/profiles/:handle", ({ params }) => getCore(options).getPublicProfile(params.handle), {
      params: t.Object({ handle: t.String({ maxLength: 20, minLength: 3 }) }),
      detail: { summary: "공개 프로필", tags: ["Profile"] },
    })
    .get(
      "/v1/assets/:id",
      async ({ params, request }) => {
        if (!options.assets)
          throw new ApiError(503, "ASSETS_UNAVAILABLE", "에셋 저장소를 준비하고 있어요.")
        const token = parseSessionToken(request.headers.get("cookie"))
        const user = token ? await getCore(options).resolveSession(token) : null
        const access = await getCore(options).getAssetAccess(user?.id ?? null, params.id)
        if (!access) throw new ApiError(404, "ASSET_NOT_FOUND", "파일을 찾을 수 없어요.")
        const object = await options.assets.get(access.storageKey)
        if (!object) throw new ApiError(404, "ASSET_NOT_FOUND", "파일을 찾을 수 없어요.")
        const headers = new Headers()
        object.writeHttpMetadata(headers)
        headers.set("content-type", access.mimeType)
        headers.set("etag", object.httpEtag)
        headers.set("cache-control", "private, max-age=300")
        return new Response(object.body, { headers })
      },
      { params: idParams, detail: { summary: "권한 확인 에셋 읽기", tags: ["Assets"] } },
    )
    .get(
      "/v1/me/portfolios",
      async ({ request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listPortfolios(user.id)
      },
      { detail: { summary: "내 프로젝트", tags: ["Portfolio"] } },
    )
    .post(
      "/v1/me/portfolios",
      async ({ body, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).createPortfolio(user.id, body)
      },
      {
        body: portfolioInput,
        detail: { summary: "프로젝트와 업로드 URL 생성", tags: ["Portfolio"] },
      },
    )
    .post(
      "/v1/me/portfolios/:id/uploads/complete",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).confirmPortfolioUpload(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 업로드 완료", tags: ["Portfolio"] } },
    )
    .delete(
      "/v1/me/portfolios/:id/uploads",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).cancelPortfolioUpload(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 업로드 취소", tags: ["Portfolio"] } },
    )
    .post(
      "/v1/me/portfolios/:id/pdf-replacements",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).createPortfolioPdfReplacement(user.id, params.id, body)
      },
      {
        body: pdfUploadInput,
        params: idParams,
        detail: { summary: "교체 PDF 업로드 URL", tags: ["Portfolio"] },
      },
    )
    .post(
      "/v1/me/portfolios/:id/pdf-replacements/:assetId/complete",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).confirmPortfolioPdfReplacement(user.id, params.id, params.assetId)
        return { ok: true }
      },
      {
        params: t.Object({
          assetId: t.String({ maxLength: 100, minLength: 1 }),
          id: t.String({ maxLength: 100, minLength: 1 }),
        }),
        detail: { summary: "교체 PDF 업로드 완료", tags: ["Portfolio"] },
      },
    )
    .delete(
      "/v1/me/portfolios/:id/pdf-replacements",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).cancelPortfolioPdfReplacement(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "PDF 교체 취소", tags: ["Portfolio"] } },
    )
    .post(
      "/v1/me/portfolios/:id/video-replacements",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).createPortfolioVideoReplacement(user.id, params.id, body)
      },
      {
        body: videoUploadInput,
        params: idParams,
        detail: { summary: "교체 영상 업로드 URL", tags: ["Portfolio"] },
      },
    )
    .post(
      "/v1/me/portfolios/:id/video-replacements/:assetId/complete",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).confirmPortfolioVideoReplacement(user.id, params.id, params.assetId)
        return { ok: true }
      },
      {
        params: t.Object({
          assetId: t.String({ maxLength: 100, minLength: 1 }),
          id: t.String({ maxLength: 100, minLength: 1 }),
        }),
        detail: { summary: "교체 영상 업로드 완료", tags: ["Portfolio"] },
      },
    )
    .delete(
      "/v1/me/portfolios/:id/video-replacements",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).cancelPortfolioVideoReplacement(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "영상 교체 취소", tags: ["Portfolio"] } },
    )
    .delete(
      "/v1/me/portfolios/:id/video",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).removePortfolioVideo(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 영상 제거", tags: ["Portfolio"] } },
    )
    .post(
      "/v1/me/portfolios/:id/publish",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).publishPortfolio(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 게시", tags: ["Portfolio"] } },
    )
    .patch(
      "/v1/me/portfolios/:id",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).updatePortfolio(user.id, params.id, body)
        return { ok: true }
      },
      {
        body: t.Object({
          roleSlugs: t.Array(t.String({ maxLength: 40 }), { maxItems: 3, minItems: 1 }),
          tags: t.Array(t.String({ maxLength: 21 }), { maxItems: 5, minItems: 1 }),
          title: t.String({ maxLength: 60, minLength: 1 }),
        }),
        params: idParams,
        detail: { summary: "프로젝트 메타데이터 수정", tags: ["Portfolio"] },
      },
    )
    .post(
      "/v1/me/portfolios/:id/retry",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).retryPortfolio(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 처리 재시도", tags: ["Portfolio"] } },
    )
    .post(
      "/v1/me/portfolios/:id/archive",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).archivePortfolio(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 보관", tags: ["Portfolio"] } },
    )
    .get(
      "/v1/me/bookmarks",
      async ({ request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listBookmarks(user.id)
      },
      { detail: { summary: "저장한 프로젝트", tags: ["Discovery"] } },
    )
    .put(
      "/v1/me/bookmarks/:id",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).setBookmark(user.id, params.id, true)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 저장", tags: ["Discovery"] } },
    )
    .delete(
      "/v1/me/bookmarks/:id",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).setBookmark(user.id, params.id, false)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "프로젝트 저장 해제", tags: ["Discovery"] } },
    )
    .get(
      "/v1/scout/candidates",
      async ({ query, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listScoutCandidates(user.id, query.role)
      },
      {
        query: t.Object({ role: t.String({ maxLength: 40, minLength: 1 }) }),
        detail: { summary: "스카우트 프로젝트 탐색", tags: ["Scout"] },
      },
    )
    .get(
      "/v1/scout/requests",
      async ({ query, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listScoutRequests(user.id, query.direction)
      },
      {
        query: t.Object({ direction: t.Union([t.Literal("received"), t.Literal("sent")]) }),
        detail: { summary: "받은·보낸 제안", tags: ["Scout"] },
      },
    )
    .post(
      "/v1/scout/requests",
      async ({ body, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).createScoutRequest(user.id, body)
      },
      {
        body: t.Object({
          estimatedPeriodText: t.String({ maxLength: 60, minLength: 1 }),
          message: t.String({ maxLength: 500, minLength: 1 }),
          projectSummary: t.String({ maxLength: 160, minLength: 1 }),
          projectTitle: t.String({ maxLength: 80, minLength: 1 }),
          requestedRoleSlug: t.String({ maxLength: 40, minLength: 1 }),
          sourcePortfolioId: t.String({ maxLength: 100, minLength: 1 }),
          teamCompositionText: t.String({ maxLength: 120, minLength: 1 }),
          weeklyCommitmentText: t.String({ maxLength: 60, minLength: 1 }),
        }),
        detail: { summary: "스카우트 제안 발송", tags: ["Scout"] },
      },
    )
    .post(
      "/v1/scout/requests/:id/:action",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).transitionScoutRequest(user.id, params.id, params.action)
      },
      {
        params: t.Object({
          action: t.Union([t.Literal("accept"), t.Literal("decline"), t.Literal("cancel")]),
          id: t.String({ maxLength: 100, minLength: 1 }),
        }),
        detail: { summary: "스카우트 제안 상태 변경", tags: ["Scout"] },
      },
    )
    .get(
      "/v1/chat/rooms",
      async ({ request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listChatRooms(user.id)
      },
      { detail: { summary: "채팅방 목록", tags: ["Chat"] } },
    )
    .get(
      "/v1/chat/rooms/:id/messages",
      async ({ params, query, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listChatMessages(user.id, params.id, query.after)
      },
      {
        params: idParams,
        query: t.Object({ after: t.Optional(t.String({ maxLength: 512 })) }),
        detail: { summary: "채팅 메시지", tags: ["Chat"] },
      },
    )
    .get(
      "/v1/chat/rooms/:id/socket",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).listChatMessages(user.id, params.id)
        if (!options.chatRooms) {
          throw new ApiError(503, "REALTIME_UNAVAILABLE", "실시간 연결을 준비하고 있어요.")
        }
        const stub = options.chatRooms.get(options.chatRooms.idFromName(params.id))
        const headers = new Headers(request.headers)
        headers.set("x-scouty-user-id", user.id)
        return stub.fetch(new Request(request.url, { headers, method: "GET" }))
      },
      { params: idParams, detail: { summary: "채팅 실시간 연결", tags: ["Chat"] } },
    )
    .post(
      "/v1/chat/rooms/:id/messages",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).sendChatMessage(user.id, params.id, body)
      },
      {
        body: t.Object({
          body: t.String({ maxLength: 2000, minLength: 1 }),
          clientMessageId: t.String({ format: "uuid" }),
        }),
        params: idParams,
        detail: { summary: "채팅 메시지 전송", tags: ["Chat"] },
      },
    )
    .post(
      "/v1/chat/rooms/:id/image-uploads",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).createChatImageUpload(user.id, params.id, body)
      },
      {
        body: t.Object({
          byteSize: t.Number({ maximum: 10 * 1024 * 1024, minimum: 1 }),
          mimeType: t.Union([
            t.Literal("image/jpeg"),
            t.Literal("image/png"),
            t.Literal("image/webp"),
          ]),
        }),
        params: idParams,
        detail: { summary: "채팅 이미지 업로드 URL", tags: ["Chat"] },
      },
    )
    .post(
      "/v1/chat/rooms/:id/images",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).sendChatImage(user.id, params.id, body)
      },
      {
        body: t.Object({
          assetId: t.String({ format: "uuid" }),
          clientMessageId: t.String({ format: "uuid" }),
        }),
        params: idParams,
        detail: { summary: "채팅 이미지 전송", tags: ["Chat"] },
      },
    )
    .post(
      "/v1/scout/requests/:id/manner",
      async ({ body, params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).submitMannerFeedback(user.id, params.id, body.sentiment)
        return { ok: true }
      },
      {
        body: t.Object({ sentiment: t.Union([t.Literal("positive"), t.Literal("negative")]) }),
        params: idParams,
        detail: { summary: "매너 평가", tags: ["Trust"] },
      },
    )
    .get(
      "/v1/me/notifications",
      async ({ request }) => {
        const user = await requireUser(request, options)
        return getCore(options).listNotifications(user.id)
      },
      { detail: { summary: "내 알림", tags: ["Notification"] } },
    )
    .post(
      "/v1/me/notifications/:id/read",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).markNotificationRead(user.id, params.id)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "알림 읽음", tags: ["Notification"] } },
    )
    .put(
      "/v1/me/blocks/:id",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).setBlock(user.id, params.id, true)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "사용자 차단", tags: ["Trust"] } },
    )
    .delete(
      "/v1/me/blocks/:id",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).setBlock(user.id, params.id, false)
        return { ok: true }
      },
      { params: idParams, detail: { summary: "사용자 차단 해제", tags: ["Trust"] } },
    )
    .post(
      "/v1/reports",
      async ({ body, request }) => {
        const user = await requireUser(request, options)
        return getCore(options).report(user.id, body)
      },
      {
        body: t.Object({
          description: t.Optional(t.String({ maxLength: 500 })),
          reasonCode: t.Union([
            t.Literal("identity_theft"),
            t.Literal("spam"),
            t.Literal("harassment"),
            t.Literal("personal_information_request"),
            t.Literal("irrelevant_commercial"),
          ]),
          targetId: t.String({ maxLength: 100, minLength: 1 }),
          targetType: t.Union([
            t.Literal("user"),
            t.Literal("portfolio"),
            t.Literal("scout_request"),
            t.Literal("message"),
          ]),
        }),
        detail: { summary: "신고 접수", tags: ["Trust"] },
      },
    )
    .post(
      "/v1/admin/reports/:id/:status",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).moderateReport(user.id, params.id, params.status)
        return { ok: true }
      },
      {
        params: t.Object({
          id: t.String({ maxLength: 100, minLength: 1 }),
          status: t.Union([t.Literal("reviewing"), t.Literal("resolved"), t.Literal("dismissed")]),
        }),
        detail: { summary: "신고 상태 변경", tags: ["Trust"] },
      },
    )
    .post(
      "/v1/admin/portfolios/:id/hide",
      async ({ params, request }) => {
        const user = await requireUser(request, options)
        await getCore(options).moderatePortfolio(user.id, params.id)
        return { ok: true }
      },
      {
        params: idParams,
        detail: { summary: "프로젝트 임시 숨김", tags: ["Trust"] },
      },
    )
}
