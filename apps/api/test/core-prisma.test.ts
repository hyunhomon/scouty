import { describe, expect, it, vi } from "vitest"
import { PrismaCoreService } from "../src/core-prisma"

const databaseValues = vi.hoisted(() => ({
  AssetKind: {
    PORTFOLIO_PAGE: "PORTFOLIO_PAGE",
    PORTFOLIO_THUMBNAIL: "PORTFOLIO_THUMBNAIL",
  },
  AssetStatus: { DELETED: "DELETED", FAILED: "FAILED", READY: "READY" },
  NotificationType: { PORTFOLIO_PROCESSING_COMPLETED: "PORTFOLIO_PROCESSING_COMPLETED" },
  PortfolioStatus: {
    ARCHIVED: "ARCHIVED",
    DRAFT: "DRAFT",
    PROCESSING: "PROCESSING",
    PUBLISHED: "PUBLISHED",
    READY: "READY",
  },
  ScoutRequestStatus: {
    ACCEPTED: "ACCEPTED",
    CANCELED: "CANCELED",
    PENDING: "PENDING",
  },
  ScoutStatus: { CLOSED: "CLOSED" },
  UserStatus: { ACTIVE: "ACTIVE", DELETED: "DELETED", SUSPENDED: "SUSPENDED" },
}))

vi.mock("@scouty/db", () => ({
  ...databaseValues,
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
}))

describe("PrismaCoreService profile completion", () => {
  it("completes onboarding without an optional avatar", async () => {
    const profileUpsert = vi.fn(async () => undefined)
    const assetFindFirst = vi.fn()
    const transaction = {
      asset: { findFirst: assetFindFirst },
      role: {
        findMany: vi.fn(async () => [{ id: "role-1", name: "PM", slug: "pm" }]),
      },
      userProfile: {
        findUnique: vi.fn(async () => ({ avatarAssetId: null, profileCompletedAt: null })),
        upsert: profileUpsert,
      },
      userRole: {
        createMany: vi.fn(async () => undefined),
        deleteMany: vi.fn(async () => undefined),
      },
    }
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
      portfolio: { findMany: vi.fn(async () => []) },
      userProfile: {
        findUnique: vi.fn(async () => ({
          avatarAssetId: null,
          bio: "좋은 아이디어를 빠르게 제품으로 만드는 사람입니다.",
          communicationPreference: null,
          handle: "hyunhomon",
          nickname: "hyunhomon",
          scoutStatus: "SELECTIVE",
          user: {
            roles: [{ priority: 1, role: { name: "PM", slug: "pm" } }],
            scoutStats: null,
          },
          userId: "user-1",
        })),
      },
    }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: {} as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    const profile = await service.updateProfile("user-1", {
      bio: "좋은 아이디어를 빠르게 제품으로 만드는 사람입니다.",
      handle: "hyunhomon",
      nickname: "hyunhomon",
      roleSlugs: ["pm"],
      scoutStatus: "selective",
    })

    expect(assetFindFirst).not.toHaveBeenCalled()
    expect(profileUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: expect.objectContaining({
        avatarAssetId: null,
        profileCompletedAt: expect.any(Date),
      }),
      create: expect.objectContaining({
        avatarAssetId: null,
        profileCompletedAt: expect.any(Date),
      }),
    })
    expect(profile.avatarUrl).toBeNull()
  })

  it("uses a normalized exact handle lookup supported by D1", async () => {
    const findFirst = vi.fn(async () => ({
      avatarAssetId: null,
      bio: "좋은 아이디어를 빠르게 제품으로 만드는 사람입니다.",
      communicationPreference: "편하게 메시지 주세요.",
      handle: "hyunhomon",
      nickname: "hyunhomon",
      scoutStatus: "SELECTIVE",
      user: {
        portfolios: [],
        roles: [{ priority: 1, role: { name: "PM", slug: "pm" } }],
        scoutStats: null,
      },
      userId: "user-1",
    }))
    const database = { userProfile: { findFirst } }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: {} as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    const profile = await service.getPublicProfile("HyunHoMon")

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ handle: { equals: "hyunhomon" } }),
      }),
    )
    expect(profile?.handle).toBe("hyunhomon")
  })
})

describe("PrismaCoreService portfolio lifecycle", () => {
  it("removes an abandoned draft and its uploaded assets", async () => {
    const portfolioDelete = vi.fn(async () => undefined)
    const assetUpdateMany = vi.fn(async () => undefined)
    const tagUpdateMany = vi.fn(async () => undefined)
    const purgeUpdateMany = vi.fn(async () => undefined)
    const assetsDelete = vi.fn(async () => undefined)
    const transaction = {
      asset: { updateMany: assetUpdateMany },
      portfolio: { delete: portfolioDelete },
      tag: { updateMany: tagUpdateMany },
    }
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
      asset: {
        findMany: vi.fn(async () => [
          { id: "pdf-1", storageKey: "users/author-1/portfolio/source.pdf" },
          { id: "video-1", storageKey: "users/author-1/portfolio/video.mp4" },
        ]),
        updateMany: purgeUpdateMany,
      },
      portfolio: {
        findFirst: vi.fn(async () => ({
          pdfAssetId: "pdf-1",
          tags: [{ tagId: "tag-1" }],
          videoAssetId: "video-1",
        })),
      },
    }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: { delete: assetsDelete } as unknown as R2Bucket,
      database: database as never,
      edgeDatabase: {} as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    await service.cancelPortfolioUpload("author-1", "portfolio-1")

    expect(portfolioDelete).toHaveBeenCalledWith({ where: { id: "portfolio-1" } })
    expect(assetUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["pdf-1", "video-1"] } },
      data: { status: databaseValues.AssetStatus.DELETED },
    })
    expect(tagUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["tag-1"] }, usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    })
    expect(assetsDelete).toHaveBeenCalledWith([
      "users/author-1/portfolio/source.pdf",
      "users/author-1/portfolio/video.mp4",
    ])
    expect(purgeUpdateMany).toHaveBeenCalled()
  })

  it("keeps processed portfolios private until the owner publishes them", async () => {
    const portfolioUpdate = vi.fn(async () => undefined)
    const notificationCreate = vi.fn(async () => undefined)
    let assetSequence = 0
    const transaction = {
      asset: {
        create: vi.fn(async () => ({ id: `asset-${++assetSequence}` })),
      },
      notification: { create: notificationCreate },
      portfolio: { update: portfolioUpdate },
      portfolioPage: {
        create: vi.fn(async () => undefined),
        deleteMany: vi.fn(async () => undefined),
      },
    }
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
      portfolio: {
        findUnique: vi.fn(async () => ({
          authorId: "author-1",
          id: "portfolio-1",
          status: databaseValues.PortfolioStatus.PROCESSING,
        })),
      },
    }
    const edgePrepare = vi.fn()
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: { prepare: edgePrepare } as unknown as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    await service.completePortfolioProcessing("portfolio-1", {
      pageCount: 1,
      pages: [
        {
          height: 1200,
          imageByteSize: 120_000,
          imageMimeType: "image/webp",
          imageStorageKey: "portfolios/portfolio-1/pages/1.webp",
          pageNumber: 1,
          thumbnailByteSize: 30_000,
          thumbnailMimeType: "image/webp",
          thumbnailStorageKey: "portfolios/portfolio-1/pages/1-thumbnail.webp",
          width: 900,
        },
      ],
    })

    expect(portfolioUpdate).toHaveBeenCalledWith({
      where: { id: "portfolio-1" },
      data: {
        pageCount: 1,
        processingErrorCode: null,
        status: databaseValues.PortfolioStatus.READY,
        videoProcessingErrorCode: null,
      },
    })
    expect(notificationCreate).toHaveBeenCalledWith({
      data: {
        entityId: "portfolio-1",
        entityType: "portfolio",
        type: databaseValues.NotificationType.PORTFOLIO_PROCESSING_COMPLETED,
        userId: "author-1",
      },
    })
    expect(edgePrepare).not.toHaveBeenCalled()
  })

  it("keeps the PDF publishable when optional video validation fails", async () => {
    const portfolioUpdate = vi.fn(async () => undefined)
    const assetUpdate = vi.fn(async () => undefined)
    let assetSequence = 0
    const transaction = {
      asset: {
        create: vi.fn(async () => ({ id: `asset-${++assetSequence}` })),
        update: assetUpdate,
      },
      notification: { create: vi.fn(async () => undefined) },
      portfolio: { update: portfolioUpdate },
      portfolioPage: {
        create: vi.fn(async () => undefined),
        deleteMany: vi.fn(async () => undefined),
      },
    }
    const database = {
      $transaction: vi.fn(async (operation: (client: typeof transaction) => Promise<void>) =>
        operation(transaction),
      ),
      portfolio: {
        findUnique: vi.fn(async () => ({
          authorId: "author-1",
          id: "portfolio-1",
          pdfAssetId: "pdf-1",
          status: databaseValues.PortfolioStatus.PROCESSING,
          videoAssetId: "video-1",
        })),
      },
    }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: { prepare: vi.fn() } as unknown as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    await service.completePortfolioProcessing("portfolio-1", {
      pageCount: 1,
      pages: [
        {
          height: 1200,
          imageByteSize: 120_000,
          imageMimeType: "image/webp",
          imageStorageKey: "portfolios/portfolio-1/pages/1.webp",
          pageNumber: 1,
          thumbnailByteSize: 30_000,
          thumbnailMimeType: "image/webp",
          thumbnailStorageKey: "portfolios/portfolio-1/pages/1-thumbnail.webp",
          width: 900,
        },
      ],
      video: { errorCode: "VIDEO_VALIDATION_FAILED", status: "failed" },
    })

    expect(assetUpdate).toHaveBeenCalledWith({
      where: { id: "video-1" },
      data: { status: databaseValues.AssetStatus.FAILED },
    })
    expect(portfolioUpdate).toHaveBeenCalledWith({
      where: { id: "portfolio-1" },
      data: {
        pageCount: 1,
        processingErrorCode: null,
        status: databaseValues.PortfolioStatus.READY,
        videoProcessingErrorCode: "VIDEO_VALIDATION_FAILED",
      },
    })
  })
})

describe("PrismaCoreService engagement recovery", () => {
  it("returns a stable cursor and caps reconnect recovery pages at 100 messages", async () => {
    const createdAt = new Date("2026-08-07T00:00:00.000Z")
    const messages = Array.from({ length: 101 }, (_, index) => ({
      assetId: null,
      body: `message-${index + 1}`,
      createdAt: new Date(createdAt.getTime() + index + 1),
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      senderId: "other-user",
      type: "TEXT",
    }))
    const readStateUpsert = vi.fn(async () => undefined)
    const database = {
      chatMessage: {
        findMany: vi.fn(async () => messages),
      },
      chatReadState: { upsert: readStateUpsert },
      chatRoom: {
        findFirst: vi.fn(async () => ({
          id: "room-1",
          scoutRequest: {
            recipient: { status: databaseValues.UserStatus.ACTIVE },
            recipientId: "user-1",
            sender: { status: databaseValues.UserStatus.ACTIVE },
            senderId: "other-user",
          },
        })),
      },
    }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: {} as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })
    const after = btoa(
      JSON.stringify({
        createdAt: "2026-08-06T23:59:59.000Z",
        id: "00000000-0000-4000-8000-000000000000",
      }),
    )

    const page = await service.listChatMessages("user-1", "room-1", after)

    expect(page.items).toHaveLength(100)
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toBe(
      btoa(
        JSON.stringify({ createdAt: messages[99]?.createdAt.toISOString(), id: messages[99]?.id }),
      ),
    )
    expect(readStateUpsert).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: "room-1", userId: "user-1" } },
      update: { lastReadMessageId: messages[99]?.id, readAt: messages[99]?.createdAt },
      create: {
        lastReadMessageId: messages[99]?.id,
        readAt: messages[99]?.createdAt,
        roomId: "room-1",
        userId: "user-1",
      },
    })
  })

  it("marks only the returned request direction as read", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }))
    const database = {
      scoutRequest: {
        findMany: vi.fn(async () => [
          {
            createdAt: new Date("2026-08-07T00:00:00.000Z"),
            id: "request-1",
            projectSummary: "summary",
            projectTitle: "project",
            recipient: {
              id: "user-1",
              profile: { handle: "recipient", nickname: "recipient" },
              status: databaseValues.UserStatus.ACTIVE,
            },
            recipientId: "user-1",
            recipientReadAt: null,
            requestedRole: { name: "Backend", slug: "backend" },
            sender: {
              id: "user-2",
              profile: { handle: "sender", nickname: "sender" },
              status: databaseValues.UserStatus.ACTIVE,
            },
            senderReadAt: new Date(),
            sourcePortfolioId: "portfolio-1",
            sourcePortfolioTitleSnapshot: "Portfolio",
            status: databaseValues.ScoutRequestStatus.PENDING,
          },
        ]),
        updateMany,
      },
    }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: {} as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    const requests = await service.listScoutRequests("user-1", "received")

    expect(requests[0]?.isUnread).toBe(true)
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["request-1"] } },
      data: { recipientReadAt: expect.any(Date) },
    })
  })
})

describe("PrismaCoreService account deletion", () => {
  it("removes discovery exposure before anonymizing the account and sessions", async () => {
    const invocation: string[] = []
    const run = vi.fn(async () => {
      invocation.push("projection")
    })
    const userUpdate = vi.fn(async () => {
      invocation.push("canonical")
    })
    const operation = { updateMany: vi.fn(async () => ({ count: 1 })) }
    const transaction = {
      asset: operation,
      chatMessage: operation,
      notification: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      portfolio: operation,
      portfolioBookmark: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      report: operation,
      scoutRequest: operation,
      session: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      user: { update: userUpdate },
      userBlock: { deleteMany: vi.fn(async () => ({ count: 1 })) },
      userProfile: operation,
      userRole: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    }
    const database = {
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
      user: {
        findFirst: vi.fn(async () => ({ id: "user-1" })),
      },
    }
    const service = new PrismaCoreService({
      apiOrigin: "https://api.greeney.life",
      assets: {} as R2Bucket,
      database: database as never,
      edgeDatabase: {
        prepare: vi.fn(() => ({ bind: vi.fn(() => ({ run })) })),
      } as unknown as D1Database,
      processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
      signer: {
        signGet: vi.fn(async () => "https://assets.example/file"),
        signPut: vi.fn(async () => ({ headers: {}, url: "https://assets.example/file" })),
      },
    })

    await service.deleteAccount("user-1")

    expect(invocation).toEqual(["projection", "canonical"])
    expect(transaction.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        authSubject: expect.stringMatching(/^deleted:user-1:/),
        deletedAt: expect.any(Date),
        email: null,
        status: databaseValues.UserStatus.DELETED,
      },
    })
  })
})
