import { describe, expect, it, vi } from "vitest"
import { PrismaCoreService } from "../src/core-prisma"

const databaseValues = vi.hoisted(() => ({
  AssetKind: {
    PORTFOLIO_PAGE: "PORTFOLIO_PAGE",
    PORTFOLIO_THUMBNAIL: "PORTFOLIO_THUMBNAIL",
  },
  AssetStatus: { FAILED: "FAILED", READY: "READY" },
  NotificationType: { PORTFOLIO_PROCESSING_COMPLETED: "PORTFOLIO_PROCESSING_COMPLETED" },
  PortfolioStatus: {
    ARCHIVED: "ARCHIVED",
    PROCESSING: "PROCESSING",
    READY: "READY",
  },
}))

vi.mock("@scouty/db", () => ({
  ...databaseValues,
  Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
}))

describe("PrismaCoreService portfolio lifecycle", () => {
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
