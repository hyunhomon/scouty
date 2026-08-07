import {
  AssetKind,
  AssetStatus,
  ChatMessageType,
  type ChatMessage as DatabaseChatMessage,
  MannerSentiment as DatabaseMannerSentiment,
  ReportTargetType as DatabaseReportTargetType,
  ScoutRequestStatus as DatabaseScoutRequestStatus,
  ScoutStatus as DatabaseScoutStatus,
  NotificationType,
  PortfolioReplacementStatus,
  PortfolioStatus,
  Prisma,
  ReportStatus,
  type ScoutyPrismaClient,
  UserStatus,
} from "@scouty/db"
import {
  ApiError,
  type ChatMessage,
  type ChatMessagePage,
  type ChatRoomSummary,
  type CompletePortfolioProcessingInput,
  type CoreService,
  type CreatePortfolioInput,
  type CreateScoutRequestInput,
  calculateMannerTemperature,
  hasExpectedFileSignature,
  isValidHandle,
  type MannerSentiment,
  type NotificationSummary,
  normalizeHandle,
  normalizeTags,
  type PortfolioSummary,
  type PortfolioUploadTicket,
  type ProductEvent,
  type ProfileSummary,
  type PublicProfile,
  type ReportTargetType,
  type ScoutCandidate,
  type ScoutRequestStatus,
  type ScoutRequestSummary,
  type ScoutStatus,
  type SessionUser,
  type UnreadCounts,
  type UpdateProfileInput,
} from "./core"
import { createRandomToken, sha256 } from "./security"

type CoreDependencies = {
  apiOrigin: string
  assets: R2Bucket
  database: ScoutyPrismaClient
  edgeDatabase: D1Database
  processingQueue: Queue<{ portfolioId: string; requestedAt: string }>
  track?: ((event: ProductEvent) => void) | undefined
  processor?:
    | {
        inspectVideo(input: {
          portfolioId: string
          videoUrl: string
        }): Promise<{ durationSeconds: number }>
        process(input: {
          outputPrefix: string
          pdfUrl: string
          portfolioId: string
          videoUrl?: string
        }): Promise<CompletePortfolioProcessingInput>
      }
    | undefined
  signer: {
    signGet(storageKey: string, expiresInSeconds?: number): Promise<string>
    signPut(
      storageKey: string,
      contentType: string,
      expiresInSeconds?: number,
    ): Promise<{ headers: Record<string, string>; url: string }>
  }
  notifyChat?: ((roomId: string, message: ChatMessage) => Promise<void>) | undefined
}

const profileInclude = {
  avatarAsset: true,
  user: {
    include: {
      roles: { include: { role: true }, orderBy: { priority: "asc" as const } },
      scoutStats: true,
    },
  },
} satisfies Prisma.UserProfileInclude

const portfolioInclude = {
  replacementPdfAsset: true,
  replacementVideoAsset: true,
  roles: { include: { role: true } },
  tags: { include: { tag: true } },
  videoAsset: true,
} satisfies Prisma.PortfolioInclude

function scoutStatus(value: DatabaseScoutStatus): ScoutStatus {
  return value.toLowerCase() as ScoutStatus
}

function portfolioStatus(value: PortfolioStatus): PortfolioSummary["status"] {
  return value.toLowerCase() as PortfolioSummary["status"]
}

function requestStatus(value: DatabaseScoutRequestStatus): ScoutRequestStatus {
  return value.toLowerCase() as ScoutRequestStatus
}

function messageType(value: ChatMessageType): ChatMessage["type"] {
  return value.toLowerCase() as ChatMessage["type"]
}

function mapPortfolio(portfolio: Prisma.PortfolioGetPayload<{ include: typeof portfolioInclude }>) {
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

function mapProfile(profile: Prisma.UserProfileGetPayload<{ include: typeof profileInclude }>) {
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

function mapReportTarget(value: ReportTargetType) {
  const values = {
    message: DatabaseReportTargetType.MESSAGE,
    portfolio: DatabaseReportTargetType.PORTFOLIO,
    scout_request: DatabaseReportTargetType.SCOUT_REQUEST,
    user: DatabaseReportTargetType.USER,
  }
  return values[value]
}

function mapMannerSentiment(value: MannerSentiment) {
  return value === "positive" ? DatabaseMannerSentiment.POSITIVE : DatabaseMannerSentiment.NEGATIVE
}

function prismaCode(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null
}

type ChatCursor = { createdAt: string; id: string }

function encodeChatCursor(cursor: ChatCursor) {
  return btoa(JSON.stringify(cursor))
}

function decodeChatCursor(value: string): ChatCursor {
  try {
    const parsed = JSON.parse(atob(value)) as Partial<ChatCursor>
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(new Date(parsed.createdAt).getTime()) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)
    ) {
      throw new Error("invalid cursor")
    }
    return { createdAt: parsed.createdAt, id: parsed.id }
  } catch {
    throw new ApiError(400, "INVALID_CHAT_CURSOR", "채팅 동기화 위치가 올바르지 않아요.")
  }
}

function staggerCandidates(candidates: ScoutCandidate[]) {
  const remaining = [...candidates]
  const staggered: ScoutCandidate[] = []
  let previousAuthor: string | undefined
  while (remaining.length > 0) {
    const differentAuthor = remaining.findIndex(
      (candidate) => candidate.author.handle !== previousAuthor,
    )
    const [candidate] = remaining.splice(differentAuthor >= 0 ? differentAuthor : 0, 1)
    if (!candidate) break
    staggered.push(candidate)
    previousAuthor = candidate.author.handle
  }
  return staggered
}

export class PrismaCoreService implements CoreService {
  constructor(private readonly dependencies: CoreDependencies) {}

  private track(event: ProductEvent) {
    try {
      this.dependencies.track?.(event)
    } catch {
      // Product analytics must never block a user action.
    }
  }

  async trackProductEvent(event: ProductEvent) {
    this.track(event)
  }

  private async assertFileSignature(storageKey: string, mimeType: string) {
    const object = await this.dependencies.assets.get(storageKey, {
      range: { length: 16, offset: 0 },
    })
    if (!object) throw new ApiError(409, "UPLOAD_INCOMPLETE", "업로드가 아직 완료되지 않았어요.")
    const bytes = new Uint8Array(await object.arrayBuffer())
    if (!hasExpectedFileSignature(mimeType, bytes)) {
      throw new ApiError(415, "INVALID_FILE_SIGNATURE", "파일 형식과 실제 내용이 일치하지 않아요.")
    }
  }

  async signInWithOAuth(input: { email: string | null; provider: "google"; subject: string }) {
    const identity = { authProvider: input.provider, authSubject: input.subject }
    let existing = await this.dependencies.database.user.findUnique({
      where: { authProvider_authSubject: identity },
    })
    if (existing?.status === UserStatus.DELETED) {
      throw new ApiError(403, "ACCOUNT_DELETED", "삭제된 계정이에요.")
    }
    if (existing?.status === UserStatus.SUSPENDED) {
      throw new ApiError(403, "ACCOUNT_SUSPENDED", "이 계정은 현재 사용할 수 없어요.")
    }
    let isNewUser = false
    let user: Prisma.UserGetPayload<{ include: { profile: true } }>
    if (existing) {
      user = await this.dependencies.database.user.update({
        where: { id: existing.id },
        data: { email: input.email },
        include: { profile: true },
      })
    } else {
      try {
        user = await this.dependencies.database.user.create({
          data: {
            ...identity,
            email: input.email,
            profile: { create: {} },
            scoutStats: { create: {} },
          },
          include: { profile: true },
        })
        isNewUser = true
      } catch (error) {
        if (prismaCode(error) !== "P2002") throw error
        existing = await this.dependencies.database.user.findUnique({
          where: { authProvider_authSubject: identity },
        })
        if (!existing) throw error
        if (existing.status === UserStatus.DELETED) {
          throw new ApiError(403, "ACCOUNT_DELETED", "삭제된 계정이에요.")
        }
        if (existing.status === UserStatus.SUSPENDED) {
          throw new ApiError(403, "ACCOUNT_SUSPENDED", "이 계정은 현재 사용할 수 없어요.")
        }
        user = await this.dependencies.database.user.update({
          where: { id: existing.id },
          data: { email: input.email },
          include: { profile: true },
        })
      }
    }

    if (!user.profile) {
      await this.dependencies.database.userProfile.create({ data: { userId: user.id } })
    }
    await this.dependencies.database.userScoutStats.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    })
    if (isNewUser) this.track("signed_up")

    return {
      email: user.email,
      id: user.id,
      isProfileComplete: Boolean(user.profile?.profileCompletedAt),
    } satisfies SessionUser
  }

  async createSession(userId: string) {
    const token = createRandomToken()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await this.dependencies.database.session.create({
      data: { expiresAt, tokenHash: await sha256(token), userId },
    })
    return { expiresAt, token }
  }

  async resolveSession(token: string) {
    const tokenHash = await sha256(token)
    const session = await this.dependencies.database.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { profile: true } } },
    })
    if (!session || session.user.status !== UserStatus.ACTIVE) return null
    if (session.expiresAt <= new Date()) {
      await this.dependencies.database.session.delete({ where: { id: session.id } })
      return null
    }

    if (session.lastSeenAt.getTime() < Date.now() - 60 * 60 * 1000) {
      await this.dependencies.database.session.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      })
    }

    return {
      email: session.user.email,
      id: session.user.id,
      isProfileComplete: Boolean(session.user.profile?.profileCompletedAt),
    }
  }

  async deleteSession(token: string) {
    await this.dependencies.database.session.deleteMany({
      where: { tokenHash: await sha256(token) },
    })
  }

  async deleteAccount(userId: string) {
    const deletedAt = new Date()
    const user = await this.dependencies.database.user.findFirst({
      where: { id: userId, status: UserStatus.ACTIVE },
      select: { id: true },
    })
    if (!user) throw new ApiError(404, "USER_NOT_FOUND", "계정을 찾을 수 없어요.")
    await this.dependencies.edgeDatabase
      .prepare("DELETE FROM discovery_portfolios WHERE author_id = ?")
      .bind(userId)
      .run()
    await this.dependencies.database.$transaction(async (transaction) => {
      await transaction.scoutRequest.updateMany({
        where: {
          status: DatabaseScoutRequestStatus.PENDING,
          OR: [{ recipientId: userId }, { senderId: userId }],
        },
        data: { canceledAt: deletedAt, status: DatabaseScoutRequestStatus.CANCELED },
      })
      await transaction.scoutRequest.updateMany({
        where: { senderId: userId },
        data: {
          estimatedPeriodText: "삭제된 계정",
          message: "삭제된 메시지",
          projectSummary: "삭제된 계정이 보낸 제안입니다.",
          projectTitle: "삭제된 계정의 제안",
          teamCompositionText: "삭제된 계정",
          weeklyCommitmentText: "삭제된 계정",
        },
      })
      await transaction.chatMessage.updateMany({
        where: { senderId: userId },
        data: { assetId: null, body: null, deletedAt },
      })
      await transaction.report.updateMany({
        where: { reporterId: userId },
        data: { description: null },
      })
      await transaction.portfolio.updateMany({
        where: { authorId: userId },
        data: { status: PortfolioStatus.ARCHIVED },
      })
      await transaction.asset.updateMany({
        where: { ownerId: userId },
        data: { status: AssetStatus.DELETED },
      })
      await transaction.userProfile.updateMany({
        where: { userId },
        data: {
          avatarAssetId: null,
          bio: null,
          communicationPreference: null,
          handle: null,
          nickname: null,
          profileCompletedAt: null,
          scoutStatus: DatabaseScoutStatus.CLOSED,
        },
      })
      await transaction.portfolioBookmark.deleteMany({ where: { userId } })
      await transaction.userRole.deleteMany({ where: { userId } })
      await transaction.userBlock.deleteMany({
        where: { OR: [{ blockedId: userId }, { blockerId: userId }] },
      })
      await transaction.notification.deleteMany({ where: { userId } })
      await transaction.session.deleteMany({ where: { userId } })
      await transaction.user.update({
        where: { id: userId },
        data: {
          authSubject: `deleted:${userId}:${crypto.randomUUID()}`,
          deletedAt,
          email: null,
          status: UserStatus.DELETED,
        },
      })
    })
    await this.purgeDeletedAssets().catch(() => undefined)
    this.track("account_deleted")
  }

  async purgeDeletedAssets() {
    const assets = await this.dependencies.database.asset.findMany({
      where: { purgedAt: null, status: AssetStatus.DELETED },
      orderBy: { createdAt: "asc" },
      select: { id: true, storageKey: true },
      take: 500,
    })
    if (assets.length > 0) {
      await this.dependencies.assets.delete(assets.map((asset) => asset.storageKey))
      await this.dependencies.database.asset.updateMany({
        where: { id: { in: assets.map((asset) => asset.id) } },
        data: { purgedAt: new Date() },
      })
    }
  }

  async getMe(userId: string) {
    const profile = await this.dependencies.database.userProfile.findUnique({
      where: { userId },
      include: profileInclude,
    })
    return profile ? mapProfile(profile) : null
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const handle = normalizeHandle(input.handle)
    if (!isValidHandle(handle)) {
      throw new ApiError(
        400,
        "INVALID_HANDLE",
        "핸들은 영문 소문자, 숫자, 밑줄 3~20자로 입력해주세요.",
      )
    }
    if (input.nickname.trim().length < 2 || input.nickname.trim().length > 20) {
      throw new ApiError(400, "INVALID_NICKNAME", "닉네임은 2~20자로 입력해주세요.")
    }
    if (input.bio.trim().length < 1 || input.bio.trim().length > 160) {
      throw new ApiError(400, "INVALID_BIO", "소개는 1~160자로 입력해주세요.")
    }
    const roleSlugs = [...new Set(input.roleSlugs)]
    if (roleSlugs.length < 1 || roleSlugs.length > 3) {
      throw new ApiError(400, "INVALID_ROLES", "역할은 1~3개 선택해주세요.")
    }

    let completedForFirstTime = false
    try {
      await this.dependencies.database.$transaction(async (transaction) => {
        const currentProfile = await transaction.userProfile.findUnique({ where: { userId } })
        completedForFirstTime = !currentProfile?.profileCompletedAt
        const avatarAssetId =
          (input.avatarAssetId === undefined
            ? currentProfile?.avatarAssetId
            : input.avatarAssetId) ?? null
        const roles = await transaction.role.findMany({
          where: { isActive: true, slug: { in: roleSlugs } },
        })
        if (roles.length !== roleSlugs.length) {
          throw new ApiError(400, "INVALID_ROLES", "선택할 수 없는 역할이 포함되어 있어요.")
        }

        if (avatarAssetId) {
          const avatar = await transaction.asset.findFirst({
            where: {
              id: avatarAssetId,
              kind: AssetKind.AVATAR,
              ownerId: userId,
              status: AssetStatus.READY,
            },
          })
          if (!avatar)
            throw new ApiError(400, "INVALID_AVATAR", "사용할 수 없는 프로필 이미지예요.")
        }

        await transaction.userProfile.upsert({
          where: { userId },
          update: {
            avatarAssetId,
            bio: input.bio.trim(),
            communicationPreference: input.communicationPreference?.trim() || null,
            handle,
            nickname: input.nickname.trim(),
            profileCompletedAt: new Date(),
            scoutStatus: input.scoutStatus.toUpperCase() as DatabaseScoutStatus,
          },
          create: {
            avatarAssetId,
            bio: input.bio.trim(),
            communicationPreference: input.communicationPreference?.trim() || null,
            handle,
            nickname: input.nickname.trim(),
            profileCompletedAt: new Date(),
            scoutStatus: input.scoutStatus.toUpperCase() as DatabaseScoutStatus,
            userId,
          },
        })
        await transaction.userRole.deleteMany({ where: { userId } })
        await transaction.userRole.createMany({
          data: roleSlugs.map((slug, index) => ({
            priority: index + 1,
            roleId: roles.find((role) => role.slug === slug)?.id ?? "",
            userId,
          })),
        })
      })
    } catch (error) {
      if (prismaCode(error) === "P2002") {
        throw new ApiError(409, "HANDLE_TAKEN", "이미 사용 중인 핸들이에요.")
      }
      throw error
    }
    const publishedPortfolios = await this.dependencies.database.portfolio.findMany({
      where: { authorId: userId, status: PortfolioStatus.PUBLISHED },
      select: { id: true },
    })
    await Promise.all(publishedPortfolios.map((portfolio) => this.projectPortfolio(portfolio.id)))

    const profile = await this.getMe(userId)
    if (!profile) throw new ApiError(503, "PROFILE_WRITE_FAILED", "프로필을 저장하지 못했어요.")
    if (completedForFirstTime) this.track("profile_completed")
    return profile
  }

  async getPublicProfile(handleValue: string) {
    const profile = await this.dependencies.database.userProfile.findFirst({
      where: {
        handle: { equals: normalizeHandle(handleValue), mode: "insensitive" },
        profileCompletedAt: { not: null },
        user: { status: UserStatus.ACTIVE },
      },
      include: {
        ...profileInclude,
        user: {
          include: {
            ...profileInclude.user.include,
            portfolios: {
              where: { status: PortfolioStatus.PUBLISHED },
              orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
              include: portfolioInclude,
            },
          },
        },
      },
    })
    if (!profile) return null
    const summary = mapProfile(profile)
    if (!summary) return null
    return {
      ...summary,
      portfolios: profile.user.portfolios.map(mapPortfolio),
    } satisfies PublicProfile
  }

  async listPortfolios(userId: string) {
    const portfolios = await this.dependencies.database.portfolio.findMany({
      where: { authorId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: portfolioInclude,
    })
    return portfolios.map(mapPortfolio)
  }

  async createAvatarUpload(
    userId: string,
    input: { byteSize: number; mimeType: "image/jpeg" | "image/png" | "image/webp" },
  ) {
    if (input.byteSize < 1 || input.byteSize > 5 * 1024 * 1024) {
      throw new ApiError(400, "INVALID_AVATAR_SIZE", "프로필 이미지는 최대 5MB까지 올릴 수 있어요.")
    }
    const assetId = crypto.randomUUID()
    const extension =
      input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg"
    const storageKey = `users/${userId}/avatars/${assetId}.${extension}`
    await this.dependencies.database.asset.create({
      data: {
        byteSize: BigInt(input.byteSize),
        id: assetId,
        kind: AssetKind.AVATAR,
        mimeType: input.mimeType,
        ownerId: userId,
        storageKey,
      },
    })
    const upload = await this.dependencies.signer.signPut(storageKey, input.mimeType)
    return {
      assetId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      headers: upload.headers,
      url: upload.url,
    }
  }

  async confirmAvatarUpload(userId: string, assetId: string) {
    const asset = await this.dependencies.database.asset.findFirst({
      where: { id: assetId, kind: AssetKind.AVATAR, ownerId: userId },
    })
    if (!asset) throw new ApiError(404, "ASSET_NOT_FOUND", "업로드 정보를 찾을 수 없어요.")
    const object = await this.dependencies.assets.head(asset.storageKey)
    if (!object || object.size !== Number(asset.byteSize)) {
      throw new ApiError(409, "UPLOAD_INCOMPLETE", "프로필 이미지 업로드가 완료되지 않았어요.")
    }
    await this.assertFileSignature(asset.storageKey, asset.mimeType)
    await this.dependencies.database.asset.update({
      where: { id: assetId },
      data: { status: AssetStatus.READY },
    })
  }

  async createPortfolio(userId: string, input: CreatePortfolioInput) {
    const profile = await this.dependencies.database.userProfile.findUnique({ where: { userId } })
    if (!profile?.profileCompletedAt) {
      throw new ApiError(403, "PROFILE_REQUIRED", "프로필을 먼저 완성해주세요.")
    }
    if (input.title.trim().length < 1 || input.title.trim().length > 60) {
      throw new ApiError(400, "INVALID_TITLE", "제목은 1~60자로 입력해주세요.")
    }
    if (input.pdf.byteSize < 1 || input.pdf.byteSize > 50 * 1024 * 1024) {
      throw new ApiError(400, "INVALID_PDF_SIZE", "PDF는 최대 50MB까지 올릴 수 있어요.")
    }
    if (
      input.video &&
      (input.video.byteSize < 1 ||
        input.video.byteSize > 200 * 1024 * 1024 ||
        input.video.durationSeconds < 1 ||
        input.video.durationSeconds > 180)
    ) {
      throw new ApiError(400, "INVALID_VIDEO", "영상은 최대 200MB, 3분까지 올릴 수 있어요.")
    }
    const roleSlugs = [...new Set(input.roleSlugs)]
    const tags = normalizeTags(input.tags)
    if (roleSlugs.length < 1 || roleSlugs.length > 3 || tags.length < 1 || tags.length > 5) {
      throw new ApiError(400, "INVALID_METADATA", "역할 1~3개와 태그 1~5개를 입력해주세요.")
    }

    const portfolioId = crypto.randomUUID()
    const pdfAssetId = crypto.randomUUID()
    const videoAssetId = input.video ? crypto.randomUUID() : null
    const pdfStorageKey = `users/${userId}/portfolios/${portfolioId}/source.pdf`
    const videoStorageKey = input.video
      ? `users/${userId}/portfolios/${portfolioId}/video.${input.video.mimeType === "video/webm" ? "webm" : input.video.mimeType === "video/quicktime" ? "mov" : "mp4"}`
      : null

    await this.dependencies.database.$transaction(async (transaction) => {
      const roles = await transaction.role.findMany({
        where: { isActive: true, slug: { in: roleSlugs } },
      })
      if (roles.length !== roleSlugs.length) {
        throw new ApiError(400, "INVALID_ROLES", "선택할 수 없는 역할이 포함되어 있어요.")
      }
      await transaction.asset.create({
        data: {
          byteSize: BigInt(input.pdf.byteSize),
          id: pdfAssetId,
          kind: AssetKind.PORTFOLIO_PDF,
          mimeType: input.pdf.mimeType,
          ownerId: userId,
          storageKey: pdfStorageKey,
        },
      })
      if (input.video && videoAssetId && videoStorageKey) {
        await transaction.asset.create({
          data: {
            byteSize: BigInt(input.video.byteSize),
            durationSeconds: input.video.durationSeconds ?? null,
            id: videoAssetId,
            kind: AssetKind.PORTFOLIO_VIDEO,
            mimeType: input.video.mimeType,
            ownerId: userId,
            storageKey: videoStorageKey,
          },
        })
      }
      await transaction.portfolio.create({
        data: {
          authorId: userId,
          id: portfolioId,
          pdfAssetId,
          title: input.title.trim(),
          videoAssetId,
          roles: {
            create: roles.map((role) => ({ roleId: role.id })),
          },
        },
      })
      for (const tagName of tags) {
        const tag = await transaction.tag.upsert({
          where: { normalizedName: tagName },
          update: { name: tagName, usageCount: { increment: 1 } },
          create: { name: tagName, normalizedName: tagName, usageCount: 1 },
        })
        await transaction.portfolioTag.create({ data: { portfolioId, tagId: tag.id } })
      }
    })

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
    const pdfUpload = await this.dependencies.signer.signPut(pdfStorageKey, input.pdf.mimeType)
    const uploads: PortfolioUploadTicket["uploads"] = [
      { assetId: pdfAssetId, headers: pdfUpload.headers, kind: "pdf", url: pdfUpload.url },
    ]
    if (input.video && videoAssetId && videoStorageKey) {
      const videoUpload = await this.dependencies.signer.signPut(
        videoStorageKey,
        input.video.mimeType,
      )
      uploads.push({
        assetId: videoAssetId,
        headers: videoUpload.headers,
        kind: "video",
        url: videoUpload.url,
      })
    }
    this.track("portfolio_upload_started")
    return { expiresAt: expiresAt.toISOString(), portfolioId, uploads }
  }

  async createPortfolioPdfReplacement(
    userId: string,
    portfolioId: string,
    input: { byteSize: number; mimeType: "application/pdf" },
  ) {
    if (input.byteSize < 1 || input.byteSize > 50 * 1024 * 1024) {
      throw new ApiError(400, "INVALID_PDF_SIZE", "PDF는 최대 50MB까지 올릴 수 있어요.")
    }
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: {
        authorId: userId,
        id: portfolioId,
        status: { in: [PortfolioStatus.PUBLISHED, PortfolioStatus.ARCHIVED] },
      },
    })
    if (!portfolio) {
      throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "게시된 프로젝트를 찾을 수 없어요.")
    }
    if (portfolio.replacementPdfAssetId) {
      throw new ApiError(409, "REPLACEMENT_IN_PROGRESS", "이미 새 PDF를 처리하고 있어요.")
    }

    const assetId = crypto.randomUUID()
    const storageKey = `users/${userId}/portfolios/${portfolioId}/replacements/${assetId}/source.pdf`
    const upload = await this.dependencies.signer.signPut(storageKey, input.mimeType)
    await this.dependencies.database.$transaction([
      this.dependencies.database.asset.create({
        data: {
          byteSize: BigInt(input.byteSize),
          id: assetId,
          kind: AssetKind.PORTFOLIO_PDF,
          mimeType: input.mimeType,
          ownerId: userId,
          storageKey,
        },
      }),
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: {
          replacementErrorCode: null,
          replacementPdfAssetId: assetId,
          replacementStatus: PortfolioReplacementStatus.UPLOADING,
        },
      }),
    ])
    return {
      assetId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      headers: upload.headers,
      url: upload.url,
    }
  }

  async confirmPortfolioPdfReplacement(userId: string, portfolioId: string, assetId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: {
        authorId: userId,
        id: portfolioId,
        replacementPdfAssetId: assetId,
        replacementStatus: PortfolioReplacementStatus.UPLOADING,
      },
      include: { replacementPdfAsset: true },
    })
    const asset = portfolio?.replacementPdfAsset
    if (!portfolio || !asset) {
      throw new ApiError(404, "REPLACEMENT_NOT_FOUND", "PDF 교체 정보를 찾을 수 없어요.")
    }
    const object = await this.dependencies.assets.head(asset.storageKey)
    if (!object || object.size !== Number(asset.byteSize)) {
      throw new ApiError(409, "UPLOAD_INCOMPLETE", "새 PDF 업로드가 완료되지 않았어요.")
    }
    await this.assertFileSignature(asset.storageKey, asset.mimeType)
    await this.dependencies.database.$transaction([
      this.dependencies.database.asset.update({
        where: { id: asset.id },
        data: { status: AssetStatus.READY },
      }),
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: {
          replacementErrorCode: null,
          replacementStatus: PortfolioReplacementStatus.PROCESSING,
        },
      }),
    ])
    await this.dependencies.processingQueue.send({
      portfolioId,
      requestedAt: new Date().toISOString(),
    })
  }

  async cancelPortfolioPdfReplacement(userId: string, portfolioId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { authorId: userId, id: portfolioId },
      select: { replacementPdfAssetId: true, replacementStatus: true },
    })
    if (!portfolio?.replacementPdfAssetId) {
      throw new ApiError(404, "REPLACEMENT_NOT_FOUND", "취소할 PDF 교체 작업이 없어요.")
    }
    if (portfolio.replacementStatus === PortfolioReplacementStatus.PROCESSING) {
      throw new ApiError(409, "REPLACEMENT_PROCESSING", "PDF 처리 중에는 교체를 취소할 수 없어요.")
    }
    await this.dependencies.database.$transaction([
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: {
          replacementErrorCode: null,
          replacementPdfAssetId: null,
          replacementStatus: null,
        },
      }),
      this.dependencies.database.asset.update({
        where: { id: portfolio.replacementPdfAssetId },
        data: { status: AssetStatus.DELETED },
      }),
    ])
  }

  async createPortfolioVideoReplacement(
    userId: string,
    portfolioId: string,
    input: {
      byteSize: number
      durationSeconds: number
      mimeType: "video/mp4" | "video/quicktime" | "video/webm"
    },
  ) {
    if (
      input.byteSize < 1 ||
      input.byteSize > 200 * 1024 * 1024 ||
      input.durationSeconds < 1 ||
      input.durationSeconds > 180
    ) {
      throw new ApiError(400, "INVALID_VIDEO", "영상은 최대 200MB, 3분까지 올릴 수 있어요.")
    }
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: {
        authorId: userId,
        id: portfolioId,
        status: { in: [PortfolioStatus.PUBLISHED, PortfolioStatus.ARCHIVED] },
      },
    })
    if (!portfolio) throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
    if (portfolio.replacementVideoAssetId) {
      throw new ApiError(409, "VIDEO_REPLACEMENT_IN_PROGRESS", "이미 새 영상을 올리고 있어요.")
    }

    const assetId = crypto.randomUUID()
    const extension =
      input.mimeType === "video/webm"
        ? "webm"
        : input.mimeType === "video/quicktime"
          ? "mov"
          : "mp4"
    const storageKey = `users/${userId}/portfolios/${portfolioId}/replacements/${assetId}/video.${extension}`
    const upload = await this.dependencies.signer.signPut(storageKey, input.mimeType)
    await this.dependencies.database.$transaction([
      this.dependencies.database.asset.create({
        data: {
          byteSize: BigInt(input.byteSize),
          durationSeconds: Math.ceil(input.durationSeconds),
          id: assetId,
          kind: AssetKind.PORTFOLIO_VIDEO,
          mimeType: input.mimeType,
          ownerId: userId,
          storageKey,
        },
      }),
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: { replacementVideoAssetId: assetId, videoProcessingErrorCode: null },
      }),
    ])
    return {
      assetId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      headers: upload.headers,
      url: upload.url,
    }
  }

  async confirmPortfolioVideoReplacement(userId: string, portfolioId: string, assetId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { authorId: userId, id: portfolioId, replacementVideoAssetId: assetId },
      include: { replacementVideoAsset: true },
    })
    const asset = portfolio?.replacementVideoAsset
    if (!portfolio || !asset) {
      throw new ApiError(404, "VIDEO_REPLACEMENT_NOT_FOUND", "영상 교체 정보를 찾을 수 없어요.")
    }
    const object = await this.dependencies.assets.head(asset.storageKey)
    if (!object || object.size !== Number(asset.byteSize)) {
      throw new ApiError(409, "UPLOAD_INCOMPLETE", "새 영상 업로드가 완료되지 않았어요.")
    }
    await this.assertFileSignature(asset.storageKey, asset.mimeType)
    const processor = this.dependencies.processor
    if (!processor) {
      throw new ApiError(503, "PROCESSOR_NOT_CONFIGURED", "영상 처리기를 사용할 수 없어요.")
    }
    let durationSeconds: number
    try {
      const videoUrl = await this.dependencies.signer.signGet(asset.storageKey)
      durationSeconds = (await processor.inspectVideo({ portfolioId, videoUrl })).durationSeconds
    } catch {
      await this.dependencies.database.$transaction([
        this.dependencies.database.asset.update({
          where: { id: asset.id },
          data: { status: AssetStatus.FAILED },
        }),
        this.dependencies.database.portfolio.update({
          where: { id: portfolioId },
          data: {
            replacementVideoAssetId: null,
            videoProcessingErrorCode: "VIDEO_VALIDATION_FAILED",
          },
        }),
      ])
      throw new ApiError(415, "VIDEO_VALIDATION_FAILED", "영상 길이 또는 형식을 확인해 주세요.")
    }
    await this.dependencies.database.$transaction([
      this.dependencies.database.asset.update({
        where: { id: asset.id },
        data: { durationSeconds, status: AssetStatus.READY },
      }),
      ...(portfolio.videoAssetId && portfolio.videoAssetId !== asset.id
        ? [
            this.dependencies.database.asset.update({
              where: { id: portfolio.videoAssetId },
              data: { status: AssetStatus.DELETED },
            }),
          ]
        : []),
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: {
          replacementVideoAssetId: null,
          videoAssetId: asset.id,
          videoProcessingErrorCode: null,
        },
      }),
    ])
    if (portfolio.status === PortfolioStatus.PUBLISHED) await this.projectPortfolio(portfolioId)
  }

  async cancelPortfolioVideoReplacement(userId: string, portfolioId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { authorId: userId, id: portfolioId },
      select: { replacementVideoAssetId: true },
    })
    if (!portfolio?.replacementVideoAssetId) {
      throw new ApiError(404, "VIDEO_REPLACEMENT_NOT_FOUND", "취소할 영상 교체 작업이 없어요.")
    }
    await this.dependencies.database.$transaction([
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: { replacementVideoAssetId: null },
      }),
      this.dependencies.database.asset.update({
        where: { id: portfolio.replacementVideoAssetId },
        data: { status: AssetStatus.DELETED },
      }),
    ])
  }

  async removePortfolioVideo(userId: string, portfolioId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { authorId: userId, id: portfolioId },
      select: { replacementVideoAssetId: true, status: true, videoAssetId: true },
    })
    if (!portfolio) throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
    const removedAssetIds = [portfolio.videoAssetId, portfolio.replacementVideoAssetId].filter(
      (id): id is string => Boolean(id),
    )
    await this.dependencies.database.$transaction([
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: {
          replacementVideoAssetId: null,
          videoAssetId: null,
          videoProcessingErrorCode: null,
        },
      }),
      ...(removedAssetIds.length > 0
        ? [
            this.dependencies.database.asset.updateMany({
              where: { id: { in: removedAssetIds } },
              data: { status: AssetStatus.DELETED },
            }),
          ]
        : []),
    ])
    if (portfolio.status === PortfolioStatus.PUBLISHED) await this.projectPortfolio(portfolioId)
  }

  async confirmPortfolioUpload(userId: string, portfolioId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { authorId: userId, id: portfolioId, status: PortfolioStatus.DRAFT },
      include: { pdfAsset: true, videoAsset: true },
    })
    if (!portfolio) throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")

    const pdf = await this.dependencies.assets.head(portfolio.pdfAsset.storageKey)
    const video = portfolio.videoAsset
      ? await this.dependencies.assets.head(portfolio.videoAsset.storageKey)
      : null
    if (!pdf || (portfolio.videoAsset && !video)) {
      throw new ApiError(409, "UPLOAD_INCOMPLETE", "업로드가 아직 완료되지 않았어요.")
    }
    if (pdf.size !== Number(portfolio.pdfAsset.byteSize)) {
      throw new ApiError(409, "UPLOAD_SIZE_MISMATCH", "업로드한 PDF 크기가 요청과 달라요.")
    }
    if (portfolio.videoAsset && video?.size !== Number(portfolio.videoAsset.byteSize)) {
      throw new ApiError(409, "UPLOAD_SIZE_MISMATCH", "업로드한 영상 크기가 요청과 달라요.")
    }
    await this.assertFileSignature(portfolio.pdfAsset.storageKey, portfolio.pdfAsset.mimeType)
    if (portfolio.videoAsset) {
      await this.assertFileSignature(portfolio.videoAsset.storageKey, portfolio.videoAsset.mimeType)
    }

    await this.dependencies.database.$transaction([
      this.dependencies.database.asset.update({
        where: { id: portfolio.pdfAssetId },
        data: { status: AssetStatus.READY },
      }),
      this.dependencies.database.portfolio.update({
        where: { id: portfolio.id },
        data: { processingErrorCode: null, status: PortfolioStatus.PROCESSING },
      }),
    ])
    await this.dependencies.processingQueue.send({
      portfolioId,
      requestedAt: new Date().toISOString(),
    })
  }

  async completePortfolioProcessing(portfolioId: string, input: CompletePortfolioProcessingInput) {
    if (
      input.pageCount < 1 ||
      input.pageCount > 50 ||
      input.pages.length !== input.pageCount ||
      input.pages.some((page, index) => page.pageNumber !== index + 1) ||
      (input.video?.status === "ready" &&
        (!Number.isFinite(input.video.durationSeconds) ||
          input.video.durationSeconds < 1 ||
          input.video.durationSeconds > 180))
    ) {
      throw new ApiError(400, "INVALID_PROCESSED_PAGES", "변환된 페이지 정보가 올바르지 않아요.")
    }

    const portfolio = await this.dependencies.database.portfolio.findUnique({
      where: { id: portfolioId },
    })
    const isReplacement = Boolean(
      portfolio?.replacementPdfAssetId &&
        portfolio.replacementStatus === PortfolioReplacementStatus.PROCESSING,
    )
    if (!portfolio || (portfolio.status !== PortfolioStatus.PROCESSING && !isReplacement)) {
      throw new ApiError(409, "PORTFOLIO_NOT_PROCESSING", "처리 중인 프로젝트가 아니에요.")
    }
    const videoResult = portfolio.videoAssetId
      ? (input.video ?? { errorCode: "VIDEO_VALIDATION_FAILED", status: "failed" as const })
      : undefined

    await this.dependencies.database.$transaction(async (transaction) => {
      const previousPages = isReplacement
        ? await transaction.portfolioPage.findMany({
            where: { portfolioId },
            select: { imageAssetId: true, thumbnailAssetId: true },
          })
        : []
      await transaction.portfolioPage.deleteMany({ where: { portfolioId } })
      for (const page of input.pages) {
        const image = await transaction.asset.create({
          data: {
            byteSize: BigInt(page.imageByteSize),
            height: page.height,
            kind: AssetKind.PORTFOLIO_PAGE,
            mimeType: page.imageMimeType,
            ownerId: portfolio.authorId,
            status: AssetStatus.READY,
            storageKey: page.imageStorageKey,
            width: page.width,
          },
        })
        const thumbnail = await transaction.asset.create({
          data: {
            byteSize: BigInt(page.thumbnailByteSize),
            height: page.height,
            kind: AssetKind.PORTFOLIO_THUMBNAIL,
            mimeType: page.thumbnailMimeType,
            ownerId: portfolio.authorId,
            status: AssetStatus.READY,
            storageKey: page.thumbnailStorageKey,
            width: page.width,
          },
        })
        await transaction.portfolioPage.create({
          data: {
            height: page.height,
            imageAssetId: image.id,
            pageNumber: page.pageNumber,
            portfolioId,
            thumbnailAssetId: thumbnail.id,
            width: page.width,
          },
        })
      }
      if (!isReplacement && portfolio.videoAssetId && videoResult) {
        await transaction.asset.update({
          where: { id: portfolio.videoAssetId },
          data:
            videoResult.status === "ready"
              ? {
                  durationSeconds: Math.ceil(videoResult.durationSeconds),
                  status: AssetStatus.READY,
                }
              : { status: AssetStatus.FAILED },
        })
      }
      await transaction.portfolio.update({
        where: { id: portfolioId },
        data: isReplacement
          ? {
              pageCount: input.pageCount,
              pdfAssetId: portfolio.replacementPdfAssetId ?? portfolio.pdfAssetId,
              replacementErrorCode: null,
              replacementPdfAssetId: null,
              replacementStatus: null,
            }
          : {
              pageCount: input.pageCount,
              processingErrorCode: null,
              status: PortfolioStatus.READY,
              videoProcessingErrorCode:
                videoResult?.status === "failed" ? videoResult.errorCode : null,
            },
      })
      if (isReplacement) {
        const replacedAssetIds = [
          portfolio.pdfAssetId,
          ...previousPages.flatMap((page) => [page.imageAssetId, page.thumbnailAssetId]),
        ]
        await transaction.asset.updateMany({
          where: { id: { in: replacedAssetIds } },
          data: { status: AssetStatus.DELETED },
        })
      }
      await transaction.notification.create({
        data: {
          entityId: portfolioId,
          entityType: "portfolio",
          type: NotificationType.PORTFOLIO_PROCESSING_COMPLETED,
          userId: portfolio.authorId,
        },
      })
    })
    if (isReplacement && portfolio.status === PortfolioStatus.PUBLISHED) {
      await this.projectPortfolio(portfolioId)
    }
    this.track("portfolio_processing_succeeded")
  }

  async publishPortfolio(userId: string, portfolioId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { authorId: userId, id: portfolioId },
      include: { _count: { select: { pages: true } } },
    })
    if (!portfolio) throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
    if (!portfolio.pageCount || portfolio._count.pages !== portfolio.pageCount) {
      throw new ApiError(409, "PORTFOLIO_NOT_READY", "페이지 처리가 끝난 뒤 게시할 수 있어요.")
    }
    if (
      portfolio.status !== PortfolioStatus.READY &&
      portfolio.status !== PortfolioStatus.ARCHIVED
    ) {
      throw new ApiError(409, "PORTFOLIO_NOT_READY", "게시할 수 있는 프로젝트가 아니에요.")
    }
    await this.dependencies.database.portfolio.update({
      where: { id: portfolioId },
      data: { publishedAt: new Date(), status: PortfolioStatus.PUBLISHED },
    })
    await this.projectPortfolio(portfolioId)
    this.track("portfolio_published")
  }

  async retryPortfolio(userId: string, portfolioId: string) {
    const initial = await this.dependencies.database.portfolio.updateMany({
      where: { authorId: userId, id: portfolioId, status: PortfolioStatus.FAILED },
      data: { processingErrorCode: null, status: PortfolioStatus.PROCESSING },
    })
    if (initial.count === 0) {
      const replacement = await this.dependencies.database.portfolio.updateMany({
        where: {
          authorId: userId,
          id: portfolioId,
          replacementPdfAssetId: { not: null },
          replacementStatus: PortfolioReplacementStatus.FAILED,
        },
        data: {
          replacementErrorCode: null,
          replacementStatus: PortfolioReplacementStatus.PROCESSING,
        },
      })
      if (replacement.count === 0) {
        throw new ApiError(
          409,
          "PORTFOLIO_NOT_RETRYABLE",
          "다시 처리할 수 있는 프로젝트가 아니에요.",
        )
      }
    }
    await this.dependencies.processingQueue.send({
      portfolioId,
      requestedAt: new Date().toISOString(),
    })
  }

  async updatePortfolio(
    userId: string,
    portfolioId: string,
    input: { roleSlugs: string[]; tags: string[]; title: string },
  ) {
    const roleSlugs = [...new Set(input.roleSlugs)]
    const tags = normalizeTags(input.tags)
    if (
      input.title.trim().length < 1 ||
      input.title.trim().length > 60 ||
      roleSlugs.length < 1 ||
      roleSlugs.length > 3 ||
      tags.length < 1 ||
      tags.length > 5
    ) {
      throw new ApiError(400, "INVALID_METADATA", "제목, 역할과 태그를 확인해주세요.")
    }
    await this.dependencies.database.$transaction(async (transaction) => {
      const portfolio = await transaction.portfolio.findFirst({
        where: { authorId: userId, id: portfolioId },
      })
      if (!portfolio) throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
      const roles = await transaction.role.findMany({
        where: { isActive: true, slug: { in: roleSlugs } },
      })
      if (roles.length !== roleSlugs.length) {
        throw new ApiError(400, "INVALID_ROLES", "선택할 수 없는 역할이 포함되어 있어요.")
      }
      await transaction.portfolio.update({
        where: { id: portfolioId },
        data: { title: input.title.trim() },
      })
      await transaction.portfolioRole.deleteMany({ where: { portfolioId } })
      await transaction.portfolioRole.createMany({
        data: roles.map((role) => ({ portfolioId, roleId: role.id })),
      })
      const previousTags = await transaction.portfolioTag.findMany({
        where: { portfolioId },
        select: { tagId: true },
      })
      await transaction.portfolioTag.deleteMany({ where: { portfolioId } })
      const nextTagIds: string[] = []
      for (const tagName of tags) {
        const tag = await transaction.tag.upsert({
          where: { normalizedName: tagName },
          update: { name: tagName },
          create: { name: tagName, normalizedName: tagName, usageCount: 0 },
        })
        await transaction.portfolioTag.create({ data: { portfolioId, tagId: tag.id } })
        nextTagIds.push(tag.id)
      }
      const affectedTagIds = new Set([...previousTags.map(({ tagId }) => tagId), ...nextTagIds])
      for (const tagId of affectedTagIds) {
        const usageCount = await transaction.portfolioTag.count({ where: { tagId } })
        await transaction.tag.update({ where: { id: tagId }, data: { usageCount } })
      }
    })
    const portfolio = await this.dependencies.database.portfolio.findUnique({
      where: { id: portfolioId },
    })
    if (portfolio?.status === PortfolioStatus.PUBLISHED) await this.projectPortfolio(portfolioId)
  }

  async archivePortfolio(userId: string, portfolioId: string) {
    const result = await this.dependencies.database.portfolio.updateMany({
      where: { authorId: userId, id: portfolioId },
      data: { status: PortfolioStatus.ARCHIVED },
    })
    if (result.count === 0)
      throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
    await this.dependencies.edgeDatabase
      .prepare("DELETE FROM discovery_portfolios WHERE portfolio_id = ?")
      .bind(portfolioId)
      .run()
  }

  async getAssetAccess(userId: string | null, assetId: string) {
    const asset = await this.dependencies.database.asset.findUnique({
      where: { id: assetId },
      include: {
        chatMessages: { include: { room: { include: { scoutRequest: true } } }, take: 1 },
        pageImages: { include: { portfolio: true }, take: 1 },
        pageThumbnails: { include: { portfolio: true }, take: 1 },
        portfolioVideos: true,
        profileAvatars: { include: { user: true }, take: 1 },
      },
    })
    if (!asset || asset.status !== AssetStatus.READY) return null
    const isOwner = userId === asset.ownerId
    const isPublic =
      asset.pageImages.some(({ portfolio }) => portfolio.status === PortfolioStatus.PUBLISHED) ||
      asset.pageThumbnails.some(
        ({ portfolio }) => portfolio.status === PortfolioStatus.PUBLISHED,
      ) ||
      asset.portfolioVideos.some((portfolio) => portfolio.status === PortfolioStatus.PUBLISHED) ||
      asset.profileAvatars.some(
        (profile) => profile.profileCompletedAt && profile.user.status === UserStatus.ACTIVE,
      )
    const canReadChat = asset.chatMessages.some(({ room }) => {
      const request = room.scoutRequest
      return userId === request.senderId || userId === request.recipientId
    })
    return isOwner || isPublic || canReadChat
      ? { mimeType: asset.mimeType, storageKey: asset.storageKey }
      : null
  }

  async setBookmark(userId: string, portfolioId: string, bookmarked: boolean) {
    if (bookmarked) {
      const portfolio = await this.dependencies.database.portfolio.findFirst({
        where: { id: portfolioId, status: PortfolioStatus.PUBLISHED },
      })
      if (!portfolio) throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
      await this.dependencies.database.portfolioBookmark.upsert({
        where: { userId_portfolioId: { portfolioId, userId } },
        update: {},
        create: { portfolioId, userId },
      })
      this.track("bookmark_added")
      return
    }
    await this.dependencies.database.portfolioBookmark.deleteMany({
      where: { portfolioId, userId },
    })
    this.track("bookmark_removed")
  }

  async listBookmarks(userId: string) {
    const bookmarks = await this.dependencies.database.portfolioBookmark.findMany({
      where: { userId, portfolio: { status: PortfolioStatus.PUBLISHED } },
      orderBy: { createdAt: "desc" },
      include: { portfolio: { include: portfolioInclude } },
    })
    return bookmarks.map(({ portfolio }) => mapPortfolio(portfolio))
  }

  async listScoutCandidates(userId: string, roleSlug: string) {
    const candidates = await this.dependencies.database.portfolio.findMany({
      where: {
        authorId: { not: userId },
        status: PortfolioStatus.PUBLISHED,
        roles: { some: { role: { isActive: true, slug: roleSlug } } },
        author: {
          profile: {
            scoutStatus: { in: [DatabaseScoutStatus.OPEN, DatabaseScoutStatus.SELECTIVE] },
          },
          blocksCreated: { none: { blockedId: userId } },
          blocksReceived: { none: { blockerId: userId } },
        },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: 20,
      include: {
        author: { include: { profile: true, roles: { include: { role: true } } } },
        pages: { orderBy: { pageNumber: "asc" }, take: 1 },
        roles: { include: { role: true } },
        tags: { include: { tag: true } },
      },
    })
    const mapped = candidates.flatMap((portfolio) => {
      const profile = portfolio.author.profile
      if (!profile?.handle || !profile.nickname) return []
      return [
        {
          author: {
            handle: profile.handle,
            nickname: profile.nickname,
            roles: portfolio.author.roles.map(({ role }) => ({
              name: role.name,
              slug: role.slug,
            })),
            scoutStatus: scoutStatus(profile.scoutStatus),
            userId: portfolio.authorId,
          },
          coverUrl: portfolio.pages[0]
            ? `${this.dependencies.apiOrigin}/v1/assets/${portfolio.pages[0].thumbnailAssetId}`
            : null,
          id: portfolio.id,
          roles: portfolio.roles.map(({ role }) => ({ name: role.name, slug: role.slug })),
          tags: portfolio.tags.map(({ tag }) => tag.name),
          title: portfolio.title,
        } satisfies ScoutCandidate,
      ]
    })
    return staggerCandidates(mapped)
  }

  async listExcludedDiscoveryAuthors(userId: string) {
    const blocks = await this.dependencies.database.userBlock.findMany({
      where: { OR: [{ blockedId: userId }, { blockerId: userId }] },
    })
    return [
      userId,
      ...new Set(
        blocks.map((block) => (block.blockerId === userId ? block.blockedId : block.blockerId)),
      ),
    ]
  }

  async createScoutRequest(userId: string, input: CreateScoutRequestInput) {
    try {
      return await this.dependencies.database.$transaction(async (transaction) => {
        const sender = await transaction.user.findUnique({
          where: { id: userId },
          include: {
            profile: true,
            _count: { select: { portfolios: { where: { status: PortfolioStatus.PUBLISHED } } } },
          },
        })
        if (!sender?.profile?.profileCompletedAt || sender._count.portfolios < 1) {
          throw new ApiError(
            403,
            "PUBLISHED_PORTFOLIO_REQUIRED",
            "게시한 프로젝트가 있어야 제안할 수 있어요.",
          )
        }
        const source = await transaction.portfolio.findFirst({
          where: { id: input.sourcePortfolioId, status: PortfolioStatus.PUBLISHED },
          include: {
            author: {
              include: {
                profile: true,
                roles: { include: { role: true } },
                blocksCreated: { where: { blockedId: userId } },
                blocksReceived: { where: { blockerId: userId } },
              },
            },
          },
        })
        if (!source || source.authorId === userId) {
          throw new ApiError(400, "INVALID_SCOUT_TARGET", "제안할 수 없는 프로젝트예요.")
        }
        if (
          !source.author.profile ||
          source.author.profile.scoutStatus === DatabaseScoutStatus.CLOSED ||
          source.author.blocksCreated.length > 0 ||
          source.author.blocksReceived.length > 0
        ) {
          throw new ApiError(403, "SCOUT_UNAVAILABLE", "지금은 이 작성자에게 제안할 수 없어요.")
        }
        const requestedRole = source.author.roles.find(
          ({ role }) => role.slug === input.requestedRoleSlug,
        )?.role
        if (!requestedRole) {
          throw new ApiError(
            400,
            "INVALID_REQUESTED_ROLE",
            "작성자가 맡을 수 있는 역할을 선택해주세요.",
          )
        }
        const sentLastDay = await transaction.scoutRequest.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            senderId: userId,
          },
        })
        if (sentLastDay >= 10) {
          throw new ApiError(429, "SCOUT_RATE_LIMITED", "24시간 제안 한도에 도달했어요.")
        }
        const recentDecline = await transaction.scoutRequest.findFirst({
          where: {
            recipientId: source.authorId,
            senderId: userId,
            status: DatabaseScoutRequestStatus.DECLINED,
            respondedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        })
        if (recentDecline) {
          throw new ApiError(
            429,
            "SCOUT_COOLDOWN",
            "최근 거절된 사용자에게는 7일 뒤 다시 제안할 수 있어요.",
          )
        }

        const request = await transaction.scoutRequest.create({
          data: {
            estimatedPeriodText: input.estimatedPeriodText.trim(),
            message: input.message.trim(),
            projectSummary: input.projectSummary.trim(),
            projectTitle: input.projectTitle.trim(),
            recipientId: source.authorId,
            requestedRoleId: requestedRole.id,
            senderReadAt: new Date(),
            senderId: userId,
            sourcePortfolioId: source.id,
            sourcePortfolioTitleSnapshot: source.title,
            teamCompositionText: input.teamCompositionText.trim(),
            weeklyCommitmentText: input.weeklyCommitmentText.trim(),
          },
        })
        await transaction.userScoutStats.update({
          where: { userId },
          data: { scoutSentCount: { increment: 1 } },
        })
        await transaction.userScoutStats.update({
          where: { userId: source.authorId },
          data: { scoutReceivedCount: { increment: 1 } },
        })
        await transaction.notification.create({
          data: {
            entityId: request.id,
            entityType: "scout_request",
            type: NotificationType.SCOUT_REQUEST_RECEIVED,
            userId: source.authorId,
          },
        })
        this.track("scout_sent")
        return { id: request.id }
      })
    } catch (error) {
      if (prismaCode(error) === "P2002") {
        throw new ApiError(409, "PENDING_SCOUT_EXISTS", "이미 답변을 기다리는 제안이 있어요.")
      }
      throw error
    }
  }

  async getUnreadCounts(userId: string) {
    const [requests, rooms] = await Promise.all([
      this.dependencies.database.scoutRequest.count({
        where: {
          OR: [
            { recipientId: userId, recipientReadAt: null },
            { senderId: userId, senderReadAt: null },
          ],
        },
      }),
      this.dependencies.database.chatRoom.findMany({
        where: {
          scoutRequest: {
            status: DatabaseScoutRequestStatus.ACCEPTED,
            OR: [{ recipientId: userId }, { senderId: userId }],
          },
        },
        include: {
          readStates: {
            where: { userId },
            include: { lastReadMessage: true },
            take: 1,
          },
        },
      }),
    ])
    const chatCounts = await Promise.all(
      rooms.map((room) => {
        const lastRead = room.readStates[0]?.lastReadMessage
        return this.dependencies.database.chatMessage.count({
          where: {
            deletedAt: null,
            roomId: room.id,
            senderId: { not: userId },
            ...(lastRead
              ? {
                  OR: [
                    { createdAt: { gt: lastRead.createdAt } },
                    { createdAt: lastRead.createdAt, id: { gt: lastRead.id } },
                  ],
                }
              : { createdAt: { gt: room.createdAt } }),
          },
        })
      }),
    )
    return {
      chat: chatCounts.reduce((total, count) => total + count, 0),
      requests,
    } satisfies UnreadCounts
  }

  async listScoutRequests(userId: string, direction: "received" | "sent") {
    const requests = await this.dependencies.database.scoutRequest.findMany({
      where: direction === "received" ? { recipientId: userId } : { senderId: userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        recipient: { include: { profile: true } },
        requestedRole: true,
        sender: { include: { profile: true } },
        sourcePortfolio: true,
      },
    })
    const summaries = requests.flatMap((request) => {
      const other = direction === "received" ? request.sender : request.recipient
      const isDeleted = other.status !== UserStatus.ACTIVE
      if (!isDeleted && (!other.profile?.handle || !other.profile.nickname)) return []
      return [
        {
          createdAt: request.createdAt.toISOString(),
          direction,
          id: request.id,
          isUnread: direction === "received" ? !request.recipientReadAt : !request.senderReadAt,
          projectSummary: request.projectSummary,
          projectTitle: request.projectTitle,
          requestedRole: { name: request.requestedRole.name, slug: request.requestedRole.slug },
          sourcePortfolio: {
            id: request.sourcePortfolioId,
            title: request.sourcePortfolioTitleSnapshot,
          },
          status: requestStatus(request.status),
          user: {
            handle: other.profile?.handle ?? "",
            isDeleted,
            nickname: other.profile?.nickname ?? "삭제된 사용자",
            userId: other.id,
          },
        } satisfies ScoutRequestSummary,
      ]
    })
    if (requests.length > 0) {
      await this.dependencies.database.scoutRequest.updateMany({
        where: { id: { in: requests.map((request) => request.id) } },
        data:
          direction === "received" ? { recipientReadAt: new Date() } : { senderReadAt: new Date() },
      })
    }
    return summaries
  }

  async transitionScoutRequest(
    userId: string,
    scoutRequestId: string,
    action: "accept" | "cancel" | "decline",
  ) {
    return this.dependencies.database.$transaction(async (transaction) => {
      const request = await transaction.scoutRequest.findUnique({
        where: { id: scoutRequestId },
        include: { requestedRole: true },
      })
      if (!request) throw new ApiError(404, "SCOUT_NOT_FOUND", "제안을 찾을 수 없어요.")
      const isRecipientAction = action === "accept" || action === "decline"
      if (
        (isRecipientAction && request.recipientId !== userId) ||
        (action === "cancel" && request.senderId !== userId)
      ) {
        throw new ApiError(403, "SCOUT_FORBIDDEN", "이 제안을 처리할 권한이 없어요.")
      }
      const nextStatus =
        action === "accept"
          ? DatabaseScoutRequestStatus.ACCEPTED
          : action === "decline"
            ? DatabaseScoutRequestStatus.DECLINED
            : DatabaseScoutRequestStatus.CANCELED
      const update = await transaction.scoutRequest.updateMany({
        where: { id: scoutRequestId, status: DatabaseScoutRequestStatus.PENDING },
        data: {
          canceledAt: action === "cancel" ? new Date() : null,
          recipientReadAt: isRecipientAction ? new Date() : null,
          respondedAt: isRecipientAction ? new Date() : null,
          senderReadAt: action === "cancel" ? new Date() : null,
          status: nextStatus,
        },
      })
      if (update.count === 0) {
        throw new ApiError(409, "SCOUT_ALREADY_RESOLVED", "이미 처리된 제안이에요.")
      }

      if (isRecipientAction) {
        const stats = await transaction.userScoutStats.findUnique({
          where: { userId: request.recipientId },
        })
        const previousCount = stats?.responseCount ?? 0
        const previousAverage = stats?.averageResponseSeconds ?? 0n
        const elapsedSeconds = BigInt(
          Math.max(0, Math.floor((Date.now() - request.createdAt.getTime()) / 1000)),
        )
        const nextAverage =
          (previousAverage * BigInt(previousCount) + elapsedSeconds) / BigInt(previousCount + 1)
        await transaction.userScoutStats.upsert({
          where: { userId: request.recipientId },
          update: {
            averageResponseSeconds: nextAverage,
            responseCount: { increment: 1 },
            responseEligibleCount: { increment: 1 },
          },
          create: {
            averageResponseSeconds: elapsedSeconds,
            responseCount: 1,
            responseEligibleCount: 1,
            userId: request.recipientId,
          },
        })
      }

      let chatRoomId: string | null = null
      if (action === "accept") {
        const room = await transaction.chatRoom.create({ data: { scoutRequestId } })
        chatRoomId = room.id
        await transaction.chatReadState.createMany({
          data: [
            { readAt: new Date(), roomId: room.id, userId: request.senderId },
            { readAt: new Date(), roomId: room.id, userId: request.recipientId },
          ],
        })
        await transaction.chatMessage.create({
          data: {
            body: `“${request.sourcePortfolioTitleSnapshot}” 프로젝트를 보고 ${request.requestedRole.name} 역할로 제안했어요.`,
            roomId: room.id,
            type: ChatMessageType.SYSTEM,
          },
        })
        await transaction.notification.create({
          data: {
            entityId: request.id,
            entityType: "scout_request",
            type: NotificationType.SCOUT_REQUEST_ACCEPTED,
            userId: request.senderId,
          },
        })
      } else if (action === "decline") {
        await transaction.notification.create({
          data: {
            entityId: request.id,
            entityType: "scout_request",
            type: NotificationType.SCOUT_REQUEST_DECLINED,
            userId: request.senderId,
          },
        })
      }
      this.track(
        action === "accept"
          ? "scout_accepted"
          : action === "decline"
            ? "scout_declined"
            : "scout_canceled",
      )
      return { chatRoomId, status: requestStatus(nextStatus) }
    })
  }

  async listChatRooms(userId: string) {
    const rooms = await this.dependencies.database.chatRoom.findMany({
      where: {
        scoutRequest: {
          status: DatabaseScoutRequestStatus.ACCEPTED,
          OR: [{ recipientId: userId }, { senderId: userId }],
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
        },
        readStates: { where: { userId }, include: { lastReadMessage: true }, take: 1 },
        scoutRequest: {
          include: {
            mannerFeedback: { where: { fromUserId: userId }, take: 1 },
            recipient: { include: { profile: true } },
            requestedRole: true,
            sender: { include: { profile: true } },
          },
        },
      },
    })
    const summaries: ChatRoomSummary[] = []
    for (const room of rooms) {
      const request = room.scoutRequest
      const other = request.senderId === userId ? request.recipient : request.sender
      const isDeleted = other.status !== UserStatus.ACTIVE
      if (!isDeleted && (!other.profile?.handle || !other.profile.nickname)) continue
      const last = room.messages[0]
      const lastRead = room.readStates[0]?.lastReadMessage
      const [unreadCount, participants, blocked] = await Promise.all([
        this.dependencies.database.chatMessage.count({
          where: {
            ...(lastRead
              ? {
                  OR: [
                    { createdAt: { gt: lastRead.createdAt } },
                    { createdAt: lastRead.createdAt, id: { gt: lastRead.id } },
                  ],
                }
              : { createdAt: { gt: room.createdAt } }),
            deletedAt: null,
            roomId: room.id,
            senderId: { not: userId },
          },
        }),
        this.dependencies.database.chatMessage.findMany({
          where: {
            deletedAt: null,
            roomId: room.id,
            senderId: { not: null },
            type: { not: ChatMessageType.SYSTEM },
          },
          distinct: ["senderId"],
          select: { senderId: true },
        }),
        this.dependencies.database.userBlock.findFirst({
          where: {
            OR: [
              { blockedId: request.recipientId, blockerId: request.senderId },
              { blockedId: request.senderId, blockerId: request.recipientId },
            ],
          },
          select: { blockedId: true },
        }),
      ])
      const participantIds = new Set(participants.map(({ senderId }) => senderId))
      summaries.push({
        canReview:
          !isDeleted &&
          !blocked &&
          room.scoutRequest.mannerFeedback.length === 0 &&
          participantIds.has(request.senderId) &&
          participantIds.has(request.recipientId),
        id: room.id,
        isReadOnly: Boolean(blocked) || other.status !== UserStatus.ACTIVE,
        lastMessage: last
          ? {
              body: last.body,
              createdAt: last.createdAt.toISOString(),
              type: messageType(last.type),
            }
          : null,
        scoutContext: {
          portfolioTitle: request.sourcePortfolioTitleSnapshot,
          requestId: request.id,
          roleName: request.requestedRole.name,
        },
        user: {
          handle: other.profile?.handle ?? "",
          isDeleted,
          nickname: other.profile?.nickname ?? "삭제된 사용자",
          userId: other.id,
        },
        unreadCount,
      })
    }
    return summaries
  }

  async listChatMessages(userId: string, roomId: string, after?: string) {
    await this.assertChatParticipant(userId, roomId)
    const afterCursor = after ? decodeChatCursor(after) : null
    const queried = await this.dependencies.database.chatMessage.findMany({
      where: {
        deletedAt: null,
        roomId,
        ...(afterCursor
          ? {
              OR: [
                { createdAt: { gt: new Date(afterCursor.createdAt) } },
                { createdAt: new Date(afterCursor.createdAt), id: { gt: afterCursor.id } },
              ],
            }
          : {}),
      },
      orderBy: afterCursor
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "desc" }],
      take: afterCursor ? 101 : 100,
    })
    const hasMore = Boolean(afterCursor && queried.length > 100)
    const messages = afterCursor ? queried.slice(0, 100) : queried.reverse()
    const lastMessage = messages.at(-1)
    if (lastMessage) {
      await this.dependencies.database.chatReadState.upsert({
        where: { roomId_userId: { roomId, userId } },
        update: { lastReadMessageId: lastMessage.id, readAt: lastMessage.createdAt },
        create: {
          lastReadMessageId: lastMessage.id,
          readAt: lastMessage.createdAt,
          roomId,
          userId,
        },
      })
    }
    return {
      cursor: lastMessage
        ? encodeChatCursor({ createdAt: lastMessage.createdAt.toISOString(), id: lastMessage.id })
        : (after ?? null),
      hasMore,
      items: messages.map((message) => ({
        assetUrl: message.assetId
          ? `${this.dependencies.apiOrigin}/v1/assets/${message.assetId}`
          : null,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        id: message.id,
        isMine: message.senderId === userId,
        type: messageType(message.type),
      })),
    } satisfies ChatMessagePage
  }

  async sendChatMessage(
    userId: string,
    roomId: string,
    input: { body: string; clientMessageId: string },
  ) {
    if (input.body.trim().length < 1 || input.body.trim().length > 2000) {
      throw new ApiError(400, "INVALID_MESSAGE", "메시지는 1~2,000자로 입력해주세요.")
    }
    const room = await this.assertChatParticipant(userId, roomId)
    if (
      room.scoutRequest.sender.status !== UserStatus.ACTIVE ||
      room.scoutRequest.recipient.status !== UserStatus.ACTIVE
    ) {
      throw new ApiError(403, "CHAT_READ_ONLY", "삭제되거나 정지된 계정과는 대화할 수 없어요.")
    }
    const blocked = await this.dependencies.database.userBlock.findFirst({
      where: {
        OR: [
          { blockedId: room.scoutRequest.recipientId, blockerId: room.scoutRequest.senderId },
          { blockedId: room.scoutRequest.senderId, blockerId: room.scoutRequest.recipientId },
        ],
      },
    })
    if (blocked)
      throw new ApiError(403, "CHAT_READ_ONLY", "차단된 관계에서는 메시지를 보낼 수 없어요.")
    const recipientId =
      room.scoutRequest.senderId === userId
        ? room.scoutRequest.recipientId
        : room.scoutRequest.senderId

    let created: DatabaseChatMessage
    try {
      created = await this.dependencies.database.$transaction(async (transaction) => {
        const message = await transaction.chatMessage.create({
          data: {
            body: input.body.trim(),
            clientMessageId: input.clientMessageId,
            roomId,
            senderId: userId,
            type: ChatMessageType.TEXT,
          },
        })
        await transaction.notification.create({
          data: {
            entityId: roomId,
            entityType: "chat_room",
            type: NotificationType.CHAT_MESSAGE_RECEIVED,
            userId: recipientId,
          },
        })
        return message
      })
    } catch (error) {
      if (prismaCode(error) !== "P2002") throw error
      created = await this.dependencies.database.chatMessage.findFirstOrThrow({
        where: { clientMessageId: input.clientMessageId, senderId: userId },
      })
    }

    const message: ChatMessage = {
      assetUrl: null,
      body: created.body,
      createdAt: created.createdAt.toISOString(),
      id: created.id,
      isMine: true,
      type: messageType(created.type),
    }
    await this.dependencies.notifyChat?.(roomId, message)
    await this.createMannerAvailabilityNotifications(room.scoutRequest.id)
    this.track("chat_message_sent")
    return message
  }

  async createChatImageUpload(
    userId: string,
    roomId: string,
    input: { byteSize: number; mimeType: "image/jpeg" | "image/png" | "image/webp" },
  ) {
    const room = await this.assertChatParticipant(userId, roomId)
    if (
      room.scoutRequest.sender.status !== UserStatus.ACTIVE ||
      room.scoutRequest.recipient.status !== UserStatus.ACTIVE
    ) {
      throw new ApiError(403, "CHAT_READ_ONLY", "삭제되거나 정지된 계정과는 대화할 수 없어요.")
    }
    const blocked = await this.dependencies.database.userBlock.findFirst({
      where: {
        OR: [
          { blockedId: room.scoutRequest.recipientId, blockerId: room.scoutRequest.senderId },
          { blockedId: room.scoutRequest.senderId, blockerId: room.scoutRequest.recipientId },
        ],
      },
    })
    if (blocked)
      throw new ApiError(403, "CHAT_READ_ONLY", "차단된 관계에서는 이미지를 올릴 수 없어요.")
    if (input.byteSize < 1 || input.byteSize > 10 * 1024 * 1024) {
      throw new ApiError(400, "INVALID_CHAT_IMAGE_SIZE", "채팅 이미지는 장당 최대 10MB예요.")
    }
    const assetId = crypto.randomUUID()
    const extension =
      input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg"
    const storageKey = `users/${userId}/chat/${roomId}/${assetId}.${extension}`
    await this.dependencies.database.asset.create({
      data: {
        byteSize: BigInt(input.byteSize),
        id: assetId,
        kind: AssetKind.CHAT_IMAGE,
        mimeType: input.mimeType,
        ownerId: userId,
        storageKey,
      },
    })
    const upload = await this.dependencies.signer.signPut(storageKey, input.mimeType)
    return {
      assetId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      headers: upload.headers,
      url: upload.url,
    }
  }

  async sendChatImage(
    userId: string,
    roomId: string,
    input: { assetId: string; clientMessageId: string },
  ) {
    const room = await this.assertChatParticipant(userId, roomId)
    if (
      room.scoutRequest.sender.status !== UserStatus.ACTIVE ||
      room.scoutRequest.recipient.status !== UserStatus.ACTIVE
    ) {
      throw new ApiError(403, "CHAT_READ_ONLY", "삭제되거나 정지된 계정과는 대화할 수 없어요.")
    }
    const blocked = await this.dependencies.database.userBlock.findFirst({
      where: {
        OR: [
          { blockedId: room.scoutRequest.recipientId, blockerId: room.scoutRequest.senderId },
          { blockedId: room.scoutRequest.senderId, blockerId: room.scoutRequest.recipientId },
        ],
      },
    })
    if (blocked)
      throw new ApiError(403, "CHAT_READ_ONLY", "차단된 관계에서는 메시지를 보낼 수 없어요.")
    const asset = await this.dependencies.database.asset.findFirst({
      where: { id: input.assetId, kind: AssetKind.CHAT_IMAGE, ownerId: userId },
    })
    if (!asset) throw new ApiError(404, "ASSET_NOT_FOUND", "채팅 이미지를 찾을 수 없어요.")
    const object = await this.dependencies.assets.head(asset.storageKey)
    if (!object || object.size !== Number(asset.byteSize)) {
      throw new ApiError(409, "UPLOAD_INCOMPLETE", "채팅 이미지 업로드가 완료되지 않았어요.")
    }
    await this.assertFileSignature(asset.storageKey, asset.mimeType)
    const recipientId =
      room.scoutRequest.senderId === userId
        ? room.scoutRequest.recipientId
        : room.scoutRequest.senderId
    let created: DatabaseChatMessage
    try {
      created = await this.dependencies.database.$transaction(async (transaction) => {
        await transaction.asset.update({
          where: { id: asset.id },
          data: { status: AssetStatus.READY },
        })
        const message = await transaction.chatMessage.create({
          data: {
            assetId: asset.id,
            clientMessageId: input.clientMessageId,
            roomId,
            senderId: userId,
            type: ChatMessageType.IMAGE,
          },
        })
        await transaction.notification.create({
          data: {
            entityId: roomId,
            entityType: "chat_room",
            type: NotificationType.CHAT_MESSAGE_RECEIVED,
            userId: recipientId,
          },
        })
        return message
      })
    } catch (error) {
      if (prismaCode(error) !== "P2002") throw error
      created = await this.dependencies.database.chatMessage.findFirstOrThrow({
        where: { clientMessageId: input.clientMessageId, senderId: userId },
      })
    }
    const message: ChatMessage = {
      assetUrl: `${this.dependencies.apiOrigin}/v1/assets/${asset.id}`,
      body: null,
      createdAt: created.createdAt.toISOString(),
      id: created.id,
      isMine: true,
      type: "image",
    }
    await this.dependencies.notifyChat?.(roomId, message)
    await this.createMannerAvailabilityNotifications(room.scoutRequest.id)
    this.track("chat_message_sent")
    return message
  }

  async recomputeScoutStats() {
    const users = await this.dependencies.database.user.findMany({
      where: { status: UserStatus.ACTIVE },
      select: { id: true },
    })
    const eligibleBefore = new Date(Date.now() - 72 * 60 * 60 * 1000)
    for (const user of users) {
      const [sentCount, received] = await Promise.all([
        this.dependencies.database.scoutRequest.count({
          where: { invalidatedAt: null, senderId: user.id },
        }),
        this.dependencies.database.scoutRequest.findMany({
          where: { invalidatedAt: null, recipientId: user.id },
          select: { createdAt: true, respondedAt: true, status: true },
        }),
      ])
      const responded = received.filter(
        (request) =>
          request.status === DatabaseScoutRequestStatus.ACCEPTED ||
          request.status === DatabaseScoutRequestStatus.DECLINED,
      )
      const eligible = received.filter(
        (request) =>
          responded.includes(request) ||
          (request.status === DatabaseScoutRequestStatus.PENDING &&
            request.createdAt <= eligibleBefore),
      )
      const responseSeconds = responded.flatMap((request) =>
        request.respondedAt
          ? [
              BigInt(
                Math.max(
                  0,
                  Math.floor((request.respondedAt.getTime() - request.createdAt.getTime()) / 1000),
                ),
              ),
            ]
          : [],
      )
      const average =
        responseSeconds.length > 0
          ? responseSeconds.reduce((sum, value) => sum + value, 0n) / BigInt(responseSeconds.length)
          : null
      await this.dependencies.database.userScoutStats.upsert({
        where: { userId: user.id },
        update: {
          averageResponseSeconds: average,
          responseCount: responded.length,
          responseEligibleCount: eligible.length,
          scoutReceivedCount: received.length,
          scoutSentCount: sentCount,
        },
        create: {
          averageResponseSeconds: average,
          responseCount: responded.length,
          responseEligibleCount: eligible.length,
          scoutReceivedCount: received.length,
          scoutSentCount: sentCount,
          userId: user.id,
        },
      })
    }
  }

  async rebuildDiscoveryProjection() {
    const portfolios = await this.dependencies.database.portfolio.findMany({
      where: { status: PortfolioStatus.PUBLISHED },
      select: { id: true },
    })
    await this.dependencies.edgeDatabase.batch([
      this.dependencies.edgeDatabase.prepare("DELETE FROM discovery_portfolio_pages"),
      this.dependencies.edgeDatabase.prepare("DELETE FROM discovery_portfolios"),
    ])
    for (const portfolio of portfolios) await this.projectPortfolio(portfolio.id)
    await this.dependencies.edgeDatabase
      .prepare(
        `INSERT INTO sync_cursors (stream, cursor, updated_at)
         VALUES ('portfolio-rebuild', ?, ?)
         ON CONFLICT(stream) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`,
      )
      .bind(portfolios.at(-1)?.id ?? "empty", new Date().toISOString())
      .run()
  }

  async submitMannerFeedback(userId: string, scoutRequestId: string, sentiment: MannerSentiment) {
    try {
      await this.dependencies.database.$transaction(async (transaction) => {
        const request = await transaction.scoutRequest.findUnique({
          where: { id: scoutRequestId },
          include: {
            chatRoom: { include: { messages: { where: { deletedAt: null } } } },
            recipient: { select: { status: true } },
            sender: { select: { status: true } },
          },
        })
        if (
          !request ||
          request.status !== DatabaseScoutRequestStatus.ACCEPTED ||
          request.sender.status !== UserStatus.ACTIVE ||
          request.recipient.status !== UserStatus.ACTIVE ||
          (request.senderId !== userId && request.recipientId !== userId)
        ) {
          throw new ApiError(403, "MANNER_FORBIDDEN", "평가할 수 없는 관계예요.")
        }
        const sentBySender = request.chatRoom?.messages.some(
          (message) =>
            message.senderId === request.senderId && message.type !== ChatMessageType.SYSTEM,
        )
        const sentByRecipient = request.chatRoom?.messages.some(
          (message) =>
            message.senderId === request.recipientId && message.type !== ChatMessageType.SYSTEM,
        )
        if (!sentBySender || !sentByRecipient) {
          throw new ApiError(409, "MANNER_NOT_READY", "서로 메시지를 보낸 뒤 평가할 수 있어요.")
        }
        const toUserId = request.senderId === userId ? request.recipientId : request.senderId
        await transaction.mannerFeedback.create({
          data: {
            fromUserId: userId,
            scoutRequestId,
            sentiment: mapMannerSentiment(sentiment),
            toUserId,
          },
        })
        const [positiveCount, negativeCount] = await Promise.all([
          transaction.mannerFeedback.count({
            where: { sentiment: DatabaseMannerSentiment.POSITIVE, toUserId },
          }),
          transaction.mannerFeedback.count({
            where: { sentiment: DatabaseMannerSentiment.NEGATIVE, toUserId },
          }),
        ])
        await transaction.userScoutStats.upsert({
          where: { userId: toUserId },
          update: {
            mannerEvaluationCount: positiveCount + negativeCount,
            mannerTemperature: calculateMannerTemperature(positiveCount, negativeCount),
          },
          create: {
            mannerEvaluationCount: positiveCount + negativeCount,
            mannerTemperature: calculateMannerTemperature(positiveCount, negativeCount),
            userId: toUserId,
          },
        })
      })
    } catch (error) {
      if (prismaCode(error) === "P2002") {
        throw new ApiError(409, "MANNER_ALREADY_SUBMITTED", "이미 매너 평가를 남겼어요.")
      }
      throw error
    }
    this.track("manner_submitted")
  }

  async listNotifications(userId: string) {
    const notifications = await this.dependencies.database.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    })
    return notifications.map(
      (notification) =>
        ({
          createdAt: notification.createdAt.toISOString(),
          entityId: notification.entityId,
          entityType: notification.entityType,
          id: notification.id,
          isRead: Boolean(notification.readAt),
          type: notification.type.toLowerCase(),
        }) satisfies NotificationSummary,
    )
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const result = await this.dependencies.database.notification.updateMany({
      where: { id: notificationId, userId },
      data: { readAt: new Date() },
    })
    if (result.count === 0)
      throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없어요.")
  }

  async setBlock(userId: string, targetUserId: string, blocked: boolean) {
    if (userId === targetUserId)
      throw new ApiError(400, "INVALID_BLOCK", "자기 자신은 차단할 수 없어요.")
    if (blocked) {
      const target = await this.dependencies.database.user.findFirst({
        where: { id: targetUserId, status: UserStatus.ACTIVE },
        select: { id: true },
      })
      if (!target) throw new ApiError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없어요.")
      await this.dependencies.database.userBlock.upsert({
        where: { blockerId_blockedId: { blockedId: targetUserId, blockerId: userId } },
        update: {},
        create: { blockedId: targetUserId, blockerId: userId },
      })
      return
    }
    await this.dependencies.database.userBlock.deleteMany({
      where: { blockedId: targetUserId, blockerId: userId },
    })
  }

  async report(
    userId: string,
    input: {
      description?: string
      reasonCode: string
      targetId: string
      targetType: ReportTargetType
    },
  ) {
    const allowedReasons = new Set([
      "harassment",
      "identity_theft",
      "irrelevant_commercial",
      "personal_information_request",
      "spam",
    ])
    if (!allowedReasons.has(input.reasonCode)) {
      throw new ApiError(400, "INVALID_REPORT_REASON", "신고 사유를 선택해주세요.")
    }
    const targetExists = await this.reportTargetExists(userId, input.targetType, input.targetId)
    if (!targetExists) {
      throw new ApiError(404, "REPORT_TARGET_NOT_FOUND", "신고 대상을 찾을 수 없어요.")
    }
    const report = await this.dependencies.database.report.create({
      data: {
        description: input.description?.trim() || null,
        reasonCode: input.reasonCode,
        reporterId: userId,
        status: ReportStatus.OPEN,
        targetId: input.targetId,
        targetType: mapReportTarget(input.targetType),
      },
    })
    this.track("report_submitted")
    return { id: report.id }
  }

  async moderateReport(
    userId: string,
    reportId: string,
    status: "dismissed" | "resolved" | "reviewing",
  ) {
    await this.assertAdmin(userId)
    const databaseStatus =
      status === "dismissed"
        ? ReportStatus.DISMISSED
        : status === "resolved"
          ? ReportStatus.RESOLVED
          : ReportStatus.REVIEWING
    const result = await this.dependencies.database.report.updateMany({
      where: { id: reportId },
      data: {
        resolvedAt: databaseStatus === ReportStatus.REVIEWING ? null : new Date(),
        status: databaseStatus,
      },
    })
    if (result.count === 0) throw new ApiError(404, "REPORT_NOT_FOUND", "신고를 찾을 수 없어요.")
  }

  async moderatePortfolio(userId: string, portfolioId: string) {
    await this.assertAdmin(userId)
    const result = await this.dependencies.database.portfolio.updateMany({
      where: { id: portfolioId },
      data: { status: PortfolioStatus.ARCHIVED },
    })
    if (result.count === 0)
      throw new ApiError(404, "PORTFOLIO_NOT_FOUND", "프로젝트를 찾을 수 없어요.")
    await this.dependencies.edgeDatabase
      .prepare("DELETE FROM discovery_portfolios WHERE portfolio_id = ?")
      .bind(portfolioId)
      .run()
  }

  async processPortfolio(portfolioId: string) {
    const processor = this.dependencies.processor
    const portfolio = await this.dependencies.database.portfolio.findUnique({
      where: { id: portfolioId },
      include: { pdfAsset: true, replacementPdfAsset: true, videoAsset: true },
    })
    const isReplacement = Boolean(
      portfolio?.replacementPdfAsset &&
        portfolio.replacementStatus === PortfolioReplacementStatus.PROCESSING,
    )
    if (!portfolio || (portfolio.status !== PortfolioStatus.PROCESSING && !isReplacement)) return
    if (!processor) {
      if (isReplacement) {
        await this.failReplacement(portfolioId, portfolio.authorId, "PROCESSOR_NOT_CONFIGURED")
      } else {
        await this.failProcessing(portfolioId, portfolio.authorId, "PROCESSOR_NOT_CONFIGURED")
      }
      return
    }

    try {
      const sourcePdf = isReplacement ? portfolio.replacementPdfAsset : portfolio.pdfAsset
      if (!sourcePdf) throw new Error("Replacement PDF is missing")
      const pdfUrl = await this.dependencies.signer.signGet(sourcePdf.storageKey)
      const videoUrl =
        !isReplacement && portfolio.videoAsset
          ? await this.dependencies.signer.signGet(portfolio.videoAsset.storageKey)
          : undefined
      const result = await processor.process({
        outputPrefix: isReplacement
          ? `users/${portfolio.authorId}/portfolios/${portfolioId}/replacements/${sourcePdf.id}/pages`
          : `users/${portfolio.authorId}/portfolios/${portfolioId}/pages`,
        pdfUrl,
        portfolioId,
        ...(videoUrl ? { videoUrl } : {}),
      })
      await this.completePortfolioProcessing(portfolioId, result)
    } catch {
      if (isReplacement) {
        await this.failReplacement(portfolioId, portfolio.authorId, "PDF_CONVERSION_FAILED")
      } else {
        await this.failProcessing(portfolioId, portfolio.authorId, "PDF_CONVERSION_FAILED")
      }
      throw new Error("Portfolio processing failed")
    }
  }

  private async failReplacement(portfolioId: string, userId: string, code: string) {
    await this.dependencies.database.$transaction([
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: {
          replacementErrorCode: code,
          replacementStatus: PortfolioReplacementStatus.FAILED,
        },
      }),
      this.dependencies.database.notification.create({
        data: {
          entityId: portfolioId,
          entityType: "portfolio",
          type: NotificationType.PORTFOLIO_PROCESSING_FAILED,
          userId,
        },
      }),
    ])
    this.track("portfolio_processing_failed")
  }

  private async failProcessing(portfolioId: string, userId: string, code: string) {
    await this.dependencies.database.$transaction([
      this.dependencies.database.portfolio.update({
        where: { id: portfolioId },
        data: { processingErrorCode: code, status: PortfolioStatus.FAILED },
      }),
      this.dependencies.database.notification.create({
        data: {
          entityId: portfolioId,
          entityType: "portfolio",
          type: NotificationType.PORTFOLIO_PROCESSING_FAILED,
          userId,
        },
      }),
    ])
    this.track("portfolio_processing_failed")
  }

  private async createMannerAvailabilityNotifications(scoutRequestId: string) {
    const request = await this.dependencies.database.scoutRequest.findUnique({
      where: { id: scoutRequestId },
      include: { chatRoom: { include: { messages: true } } },
    })
    const messages = request?.chatRoom?.messages ?? []
    if (
      !request ||
      !messages.some((message) => message.senderId === request.senderId) ||
      !messages.some((message) => message.senderId === request.recipientId)
    ) {
      return
    }
    for (const userId of [request.senderId, request.recipientId]) {
      const existing = await this.dependencies.database.notification.findFirst({
        where: {
          entityId: request.id,
          type: NotificationType.MANNER_FEEDBACK_AVAILABLE,
          userId,
        },
      })
      if (!existing) {
        await this.dependencies.database.notification.create({
          data: {
            entityId: request.id,
            entityType: "scout_request",
            type: NotificationType.MANNER_FEEDBACK_AVAILABLE,
            userId,
          },
        })
      }
    }
  }

  private async assertChatParticipant(userId: string, roomId: string) {
    const room = await this.dependencies.database.chatRoom.findFirst({
      where: {
        id: roomId,
        scoutRequest: {
          status: DatabaseScoutRequestStatus.ACCEPTED,
          OR: [{ recipientId: userId }, { senderId: userId }],
        },
      },
      include: {
        scoutRequest: {
          include: {
            recipient: { select: { status: true } },
            sender: { select: { status: true } },
          },
        },
      },
    })
    if (!room) throw new ApiError(403, "CHAT_FORBIDDEN", "채팅방에 접근할 수 없어요.")
    return room
  }

  private async assertAdmin(userId: string) {
    const user = await this.dependencies.database.user.findFirst({
      where: { id: userId, isAdmin: true, status: UserStatus.ACTIVE },
    })
    if (!user) throw new ApiError(403, "ADMIN_REQUIRED", "운영 권한이 필요해요.")
  }

  private async reportTargetExists(userId: string, targetType: ReportTargetType, targetId: string) {
    switch (targetType) {
      case "user":
        return Boolean(
          await this.dependencies.database.user.findFirst({
            where: { id: targetId, status: UserStatus.ACTIVE },
            select: { id: true },
          }),
        )
      case "portfolio":
        return Boolean(
          await this.dependencies.database.portfolio.findFirst({
            where: { id: targetId, status: PortfolioStatus.PUBLISHED },
            select: { id: true },
          }),
        )
      case "scout_request":
        return Boolean(
          await this.dependencies.database.scoutRequest.findFirst({
            where: {
              id: targetId,
              OR: [{ recipientId: userId }, { senderId: userId }],
            },
            select: { id: true },
          }),
        )
      case "message":
        return Boolean(
          await this.dependencies.database.chatMessage.findFirst({
            where: {
              id: targetId,
              room: {
                scoutRequest: { OR: [{ recipientId: userId }, { senderId: userId }] },
              },
            },
            select: { id: true },
          }),
        )
    }
  }

  private async projectPortfolio(portfolioId: string) {
    const portfolio = await this.dependencies.database.portfolio.findFirst({
      where: { id: portfolioId, status: PortfolioStatus.PUBLISHED },
      include: {
        author: { include: { profile: { include: { avatarAsset: true } } } },
        pages: { orderBy: { pageNumber: "asc" } },
        roles: { include: { role: true } },
        tags: { include: { tag: true } },
        videoAsset: true,
      },
    })
    const profile = portfolio?.author.profile
    if (!portfolio || !profile?.handle || !profile.nickname || !portfolio.publishedAt) return
    const hasReadyVideo = portfolio.videoAsset?.status === AssetStatus.READY

    const pageStatements = portfolio.pages.map((page) =>
      this.dependencies.edgeDatabase
        .prepare(
          `INSERT INTO discovery_portfolio_pages
             (portfolio_id, page_number, image_url, width, height)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(portfolio_id, page_number) DO UPDATE SET
             image_url = excluded.image_url,
             width = excluded.width,
             height = excluded.height`,
        )
        .bind(
          portfolio.id,
          page.pageNumber,
          `${this.dependencies.apiOrigin}/v1/assets/${page.imageAssetId}`,
          page.width,
          page.height,
        ),
    )
    await this.dependencies.edgeDatabase.batch([
      this.dependencies.edgeDatabase
        .prepare(
          `INSERT INTO discovery_portfolios (
             portfolio_id, author_id, author_handle, author_nickname,
             author_avatar_url, author_bio, author_scout_status,
             title, cover_url, has_video, video_url, role_slugs_json,
             tags_json, published_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(portfolio_id) DO UPDATE SET
             author_handle = excluded.author_handle,
             author_nickname = excluded.author_nickname,
             author_avatar_url = excluded.author_avatar_url,
             author_bio = excluded.author_bio,
             author_scout_status = excluded.author_scout_status,
             title = excluded.title,
             cover_url = excluded.cover_url,
             has_video = excluded.has_video,
             video_url = excluded.video_url,
             role_slugs_json = excluded.role_slugs_json,
             tags_json = excluded.tags_json,
             published_at = excluded.published_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          portfolio.id,
          portfolio.authorId,
          profile.handle,
          profile.nickname,
          profile.avatarAssetId
            ? `${this.dependencies.apiOrigin}/v1/assets/${profile.avatarAssetId}`
            : null,
          profile.bio ?? "",
          scoutStatus(profile.scoutStatus),
          portfolio.title,
          portfolio.pages[0]
            ? `${this.dependencies.apiOrigin}/v1/assets/${portfolio.pages[0].thumbnailAssetId}`
            : null,
          hasReadyVideo ? 1 : 0,
          hasReadyVideo
            ? `${this.dependencies.apiOrigin}/v1/assets/${portfolio.videoAssetId}`
            : null,
          JSON.stringify(portfolio.roles.map(({ role }) => role.slug)),
          JSON.stringify(portfolio.tags.map(({ tag }) => tag.name)),
          portfolio.publishedAt.toISOString(),
          new Date().toISOString(),
        ),
      this.dependencies.edgeDatabase
        .prepare("DELETE FROM discovery_portfolio_pages WHERE portfolio_id = ?")
        .bind(portfolio.id),
      ...pageStatements,
    ])
  }
}
