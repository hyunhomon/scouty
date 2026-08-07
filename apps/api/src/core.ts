export type ScoutStatus = "closed" | "open" | "selective"
export type ScoutRequestStatus = "accepted" | "canceled" | "declined" | "pending"
export type MannerSentiment = "negative" | "positive"

export type SessionUser = {
  email: string | null
  id: string
  isProfileComplete: boolean
}

export type ProfileSummary = {
  avatarUrl: string | null
  bio: string
  communicationPreference: string | null
  handle: string
  nickname: string
  roles: Array<{ name: string; slug: string }>
  scoutStatus: ScoutStatus
  stats: {
    averageResponseSeconds: string | null
    mannerEvaluationCount: number
    mannerTemperature: number
    responseCount: number
    responseEligibleCount: number
    scoutReceivedCount: number
    scoutSentCount: number
  }
  userId: string
}

export type PortfolioSummary = {
  hasPendingVideoReplacement: boolean
  hasVideo: boolean
  id: string
  publishedAt: string | null
  replacementErrorCode: string | null
  replacementStatus: "failed" | "processing" | "uploading" | null
  status: "archived" | "draft" | "failed" | "processing" | "published" | "ready"
  tags: string[]
  title: string
  roles: Array<{ name: string; slug: string }>
  videoErrorCode: string | null
}

export type PublicProfile = ProfileSummary & {
  portfolios: PortfolioSummary[]
}

export type UpdateProfileInput = {
  avatarAssetId?: string | null
  bio: string
  communicationPreference?: string | null
  handle: string
  nickname: string
  roleSlugs: string[]
  scoutStatus: ScoutStatus
}

export type CreatePortfolioInput = {
  pdf: { byteSize: number; mimeType: "application/pdf" }
  roleSlugs: string[]
  tags: string[]
  title: string
  video?: {
    byteSize: number
    durationSeconds: number
    mimeType: "video/mp4" | "video/quicktime" | "video/webm"
  }
}

export type PortfolioUploadTicket = {
  expiresAt: string
  portfolioId: string
  uploads: Array<{
    assetId: string
    headers: Record<string, string>
    kind: "pdf" | "video"
    url: string
  }>
}

export type AssetUploadTicket = {
  assetId: string
  expiresAt: string
  headers: Record<string, string>
  url: string
}

export type PortfolioProcessingMessage = {
  portfolioId: string
  requestedAt: string
}

export type ProcessedPortfolioPage = {
  height: number
  imageByteSize: number
  imageMimeType: "image/jpeg" | "image/png" | "image/webp"
  imageStorageKey: string
  pageNumber: number
  thumbnailByteSize: number
  thumbnailMimeType: "image/jpeg" | "image/png" | "image/webp"
  thumbnailStorageKey: string
  width: number
}

export type CompletePortfolioProcessingInput = {
  pageCount: number
  pages: ProcessedPortfolioPage[]
  video?: { durationSeconds: number; status: "ready" } | { errorCode: string; status: "failed" }
}

export type CreateScoutRequestInput = {
  estimatedPeriodText: string
  message: string
  projectSummary: string
  projectTitle: string
  requestedRoleSlug: string
  sourcePortfolioId: string
  teamCompositionText: string
  weeklyCommitmentText: string
}

export type ScoutRequestSummary = {
  createdAt: string
  direction: "received" | "sent"
  id: string
  isUnread: boolean
  projectSummary: string
  projectTitle: string
  requestedRole: { name: string; slug: string }
  sourcePortfolio: { id: string; title: string }
  status: ScoutRequestStatus
  user: { handle: string; isDeleted: boolean; nickname: string; userId: string }
}

export type ChatRoomSummary = {
  canReview: boolean
  id: string
  isReadOnly: boolean
  lastMessage: { body: string | null; createdAt: string; type: "image" | "system" | "text" } | null
  scoutContext: { portfolioTitle: string; requestId: string; roleName: string }
  user: { handle: string; isDeleted: boolean; nickname: string; userId: string }
  unreadCount: number
}

export type ChatMessage = {
  assetUrl: string | null
  body: string | null
  createdAt: string
  id: string
  isMine: boolean
  type: "image" | "system" | "text"
}

export type ChatMessagePage = {
  cursor: string | null
  hasMore: boolean
  items: ChatMessage[]
}

export type UnreadCounts = {
  chat: number
  requests: number
}

export type ProductEvent =
  | "account_deleted"
  | "bookmark_added"
  | "bookmark_removed"
  | "chat_message_sent"
  | "feed_viewed"
  | "manner_submitted"
  | "portfolio_processing_failed"
  | "portfolio_processing_succeeded"
  | "portfolio_published"
  | "portfolio_upload_started"
  | "portfolio_viewed"
  | "profile_completed"
  | "profile_viewed"
  | "report_submitted"
  | "scout_accepted"
  | "scout_canceled"
  | "scout_declined"
  | "scout_sent"
  | "signed_up"

export type NotificationSummary = {
  createdAt: string
  entityId: string
  entityType: string
  id: string
  isRead: boolean
  type: string
}

export type ScoutCandidate = {
  author: {
    handle: string
    nickname: string
    roles: Array<{ name: string; slug: string }>
    scoutStatus: ScoutStatus
    userId: string
  }
  coverUrl: string | null
  id: string
  roles: Array<{ name: string; slug: string }>
  tags: string[]
  title: string
}

export type ReportTargetType = "message" | "portfolio" | "scout_request" | "user"

export interface CoreService {
  archivePortfolio(userId: string, portfolioId: string): Promise<void>
  cancelPortfolioPdfReplacement(userId: string, portfolioId: string): Promise<void>
  cancelPortfolioVideoReplacement(userId: string, portfolioId: string): Promise<void>
  completePortfolioProcessing(
    portfolioId: string,
    input: CompletePortfolioProcessingInput,
  ): Promise<void>
  confirmPortfolioUpload(userId: string, portfolioId: string): Promise<void>
  cancelPortfolioUpload(userId: string, portfolioId: string): Promise<void>
  confirmPortfolioPdfReplacement(
    userId: string,
    portfolioId: string,
    assetId: string,
  ): Promise<void>
  confirmPortfolioVideoReplacement(
    userId: string,
    portfolioId: string,
    assetId: string,
  ): Promise<void>
  confirmAvatarUpload(userId: string, assetId: string): Promise<void>
  createAvatarUpload(
    userId: string,
    input: { byteSize: number; mimeType: "image/jpeg" | "image/png" | "image/webp" },
  ): Promise<AssetUploadTicket>
  createPortfolio(userId: string, input: CreatePortfolioInput): Promise<PortfolioUploadTicket>
  createPortfolioPdfReplacement(
    userId: string,
    portfolioId: string,
    input: { byteSize: number; mimeType: "application/pdf" },
  ): Promise<AssetUploadTicket>
  createPortfolioVideoReplacement(
    userId: string,
    portfolioId: string,
    input: {
      byteSize: number
      durationSeconds: number
      mimeType: "video/mp4" | "video/quicktime" | "video/webm"
    },
  ): Promise<AssetUploadTicket>
  createChatImageUpload(
    userId: string,
    roomId: string,
    input: { byteSize: number; mimeType: "image/jpeg" | "image/png" | "image/webp" },
  ): Promise<AssetUploadTicket>
  createScoutRequest(userId: string, input: CreateScoutRequestInput): Promise<{ id: string }>
  createSession(userId: string): Promise<{ expiresAt: Date; token: string }>
  deleteAccount(userId: string): Promise<void>
  deleteSession(token: string): Promise<void>
  getMe(userId: string): Promise<ProfileSummary | null>
  getAssetAccess(
    userId: string | null,
    assetId: string,
  ): Promise<{ mimeType: string; storageKey: string } | null>
  getPublicProfile(handle: string): Promise<PublicProfile | null>
  getUnreadCounts(userId: string): Promise<UnreadCounts>
  listBookmarks(userId: string): Promise<PortfolioSummary[]>
  listChatMessages(userId: string, roomId: string, after?: string): Promise<ChatMessagePage>
  listChatRooms(userId: string): Promise<ChatRoomSummary[]>
  listNotifications(userId: string): Promise<NotificationSummary[]>
  listExcludedDiscoveryAuthors(userId: string): Promise<string[]>
  listPortfolios(userId: string): Promise<PortfolioSummary[]>
  listScoutRequests(userId: string, direction: "received" | "sent"): Promise<ScoutRequestSummary[]>
  listScoutCandidates(userId: string, roleSlug: string): Promise<ScoutCandidate[]>
  markNotificationRead(userId: string, notificationId: string): Promise<void>
  moderateReport(
    userId: string,
    reportId: string,
    status: "dismissed" | "resolved" | "reviewing",
  ): Promise<void>
  moderatePortfolio(userId: string, portfolioId: string): Promise<void>
  publishPortfolio(userId: string, portfolioId: string): Promise<void>
  purgeDeletedAssets(): Promise<void>
  removePortfolioVideo(userId: string, portfolioId: string): Promise<void>
  retryPortfolio(userId: string, portfolioId: string): Promise<void>
  report(
    userId: string,
    input: {
      description?: string
      reasonCode: string
      targetId: string
      targetType: ReportTargetType
    },
  ): Promise<{ id: string }>
  resolveSession(token: string): Promise<SessionUser | null>
  sendChatMessage(
    userId: string,
    roomId: string,
    input: { body: string; clientMessageId: string },
  ): Promise<ChatMessage>
  sendChatImage(
    userId: string,
    roomId: string,
    input: { assetId: string; clientMessageId: string },
  ): Promise<ChatMessage>
  setBlock(userId: string, targetUserId: string, blocked: boolean): Promise<void>
  setBookmark(userId: string, portfolioId: string, bookmarked: boolean): Promise<void>
  signInWithOAuth(input: {
    email: string | null
    provider: "google"
    subject: string
  }): Promise<SessionUser>
  submitMannerFeedback(
    userId: string,
    scoutRequestId: string,
    sentiment: MannerSentiment,
  ): Promise<void>
  trackProductEvent(event: ProductEvent): Promise<void>
  transitionScoutRequest(
    userId: string,
    scoutRequestId: string,
    action: "accept" | "cancel" | "decline",
  ): Promise<{ chatRoomId: string | null; status: ScoutRequestStatus }>
  updateProfile(userId: string, input: UpdateProfileInput): Promise<ProfileSummary>
  updatePortfolio(
    userId: string,
    portfolioId: string,
    input: { roleSlugs: string[]; tags: string[]; title: string },
  ): Promise<void>
}

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 415 | 429 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function hasExpectedFileSignature(mimeType: string, bytes: Uint8Array) {
  const matches = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value)
  const ascii = new TextDecoder().decode(bytes)

  switch (mimeType) {
    case "application/pdf":
      return ascii.startsWith("%PDF-")
    case "image/jpeg":
      return matches(0xff, 0xd8, 0xff)
    case "image/png":
      return matches(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case "image/webp":
      return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP"
    case "video/webm":
      return matches(0x1a, 0x45, 0xdf, 0xa3)
    case "video/mp4":
    case "video/quicktime":
      return ascii.slice(4, 8) === "ftyp"
    default:
      return false
  }
}

export function normalizeHandle(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeTags(values: string[]) {
  return [...new Set(values.map((value) => value.trim().replace(/^#+/, "").toLowerCase()))].filter(
    (value) => value.length >= 2 && value.length <= 20,
  )
}

export function calculateMannerTemperature(positiveCount: number, negativeCount: number) {
  const evaluationCount = positiveCount + negativeCount
  if (evaluationCount === 0) return 36.5

  const signedSum = positiveCount - negativeCount
  const temperature = 36.5 + (13.5 * signedSum) / (evaluationCount + 5)
  return Math.round(Math.min(99, Math.max(0, temperature)) * 10) / 10
}

export function isValidHandle(value: string) {
  return /^[a-z0-9_]{3,20}$/.test(value)
}

export function isAllowedReturnPath(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/feed"
  try {
    const parsed = new URL(value, "https://scouty.invalid")
    if (parsed.origin !== "https://scouty.invalid") return "/feed"
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return "/feed"
  }
}

export function parseSessionToken(cookieHeader: string | null) {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=")
    if (name === "scouty_session") return decodeURIComponent(value.join("="))
  }
  return null
}

export function createSessionCookie(token: string, expiresAt: Date, domain?: string) {
  return [
    `scouty_session=${encodeURIComponent(token)}`,
    "Path=/",
    ...(domain ? [`Domain=${domain}`] : []),
    "HttpOnly",
    ...(domain ? ["Secure"] : []),
    "SameSite=Lax",
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ")
}

export function clearSessionCookie(domain?: string) {
  return [
    "scouty_session=",
    "Path=/",
    ...(domain ? [`Domain=${domain}`] : []),
    "HttpOnly",
    ...(domain ? ["Secure"] : []),
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ")
}
