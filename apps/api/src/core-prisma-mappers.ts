import {
  AssetStatus,
  type ChatMessageType,
  MannerSentiment as DatabaseMannerSentiment,
  ReportTargetType as DatabaseReportTargetType,
  type ScoutRequestStatus as DatabaseScoutRequestStatus,
  type ScoutStatus as DatabaseScoutStatus,
  type PortfolioStatus,
  Prisma,
} from "@scouty/db"
import type {
  ChatMessage,
  MannerSentiment,
  PortfolioSummary,
  ProfileSummary,
  ReportTargetType,
  ScoutRequestStatus,
  ScoutStatus,
} from "./core"

export const profileInclude = {
  avatarAsset: true,
  user: {
    include: {
      roles: { include: { role: true }, orderBy: { priority: "asc" as const } },
      scoutStats: true,
    },
  },
} satisfies Prisma.UserProfileInclude

export const portfolioInclude = {
  replacementPdfAsset: true,
  replacementVideoAsset: true,
  roles: { include: { role: true } },
  tags: { include: { tag: true } },
  videoAsset: true,
} satisfies Prisma.PortfolioInclude

export function scoutStatus(value: DatabaseScoutStatus): ScoutStatus {
  return value.toLowerCase() as ScoutStatus
}

function portfolioStatus(value: PortfolioStatus): PortfolioSummary["status"] {
  return value.toLowerCase() as PortfolioSummary["status"]
}

export function requestStatus(value: DatabaseScoutRequestStatus): ScoutRequestStatus {
  return value.toLowerCase() as ScoutRequestStatus
}

export function messageType(value: ChatMessageType): ChatMessage["type"] {
  return value.toLowerCase() as ChatMessage["type"]
}

export function mapPortfolio(
  portfolio: Prisma.PortfolioGetPayload<{ include: typeof portfolioInclude }>,
) {
  return {
    hasPendingVideoReplacement: Boolean(portfolio.replacementVideoAssetId),
    hasVideo: portfolio.videoAsset?.status === AssetStatus.READY,
    id: portfolio.id,
    publishedAt: portfolio.publishedAt?.toISOString() ?? null,
    replacementErrorCode: portfolio.replacementErrorCode,
    replacementStatus: portfolio.replacementStatus
      ? (portfolio.replacementStatus.toLowerCase() as "failed" | "processing" | "uploading")
      : null,
    roles: portfolio.roles.map(({ role }) => ({ name: role.name, slug: role.slug })),
    status: portfolioStatus(portfolio.status),
    tags: portfolio.tags.map(({ tag }) => tag.name),
    title: portfolio.title,
    videoErrorCode: portfolio.videoProcessingErrorCode,
  } satisfies PortfolioSummary
}

export function mapProfile(
  profile: Prisma.UserProfileGetPayload<{ include: typeof profileInclude }>,
) {
  if (!profile.handle || !profile.nickname || !profile.bio) return null
  const stats = profile.user.scoutStats
  return {
    avatarUrl: profile.avatarAssetId ? `/v1/assets/${profile.avatarAssetId}` : null,
    bio: profile.bio,
    communicationPreference: profile.communicationPreference,
    handle: profile.handle,
    nickname: profile.nickname,
    roles: profile.user.roles.map(({ role }) => ({ name: role.name, slug: role.slug })),
    scoutStatus: scoutStatus(profile.scoutStatus),
    stats: {
      averageResponseSeconds: stats?.averageResponseSeconds?.toString() ?? null,
      mannerEvaluationCount: stats?.mannerEvaluationCount ?? 0,
      mannerTemperature: Number(stats?.mannerTemperature ?? 36.5),
      responseCount: stats?.responseCount ?? 0,
      responseEligibleCount: stats?.responseEligibleCount ?? 0,
      scoutReceivedCount: stats?.scoutReceivedCount ?? 0,
      scoutSentCount: stats?.scoutSentCount ?? 0,
    },
    userId: profile.userId,
  } satisfies ProfileSummary
}

export function mapReportTarget(value: ReportTargetType) {
  const values = {
    message: DatabaseReportTargetType.MESSAGE,
    portfolio: DatabaseReportTargetType.PORTFOLIO,
    scout_request: DatabaseReportTargetType.SCOUT_REQUEST,
    user: DatabaseReportTargetType.USER,
  }
  return values[value]
}

export function mapMannerSentiment(value: MannerSentiment) {
  return value === "positive" ? DatabaseMannerSentiment.POSITIVE : DatabaseMannerSentiment.NEGATIVE
}

export function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null
}
