import {
  AssetKind,
  AssetStatus,
  createPrismaClient,
  PortfolioStatus,
  ReportStatus,
  ScoutRequestStatus,
  ScoutStatus,
} from "@scouty/db"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { PrismaCoreService } from "../src/core-prisma"

const connectionString = process.env.DATABASE_URL

if (!connectionString) throw new Error("DATABASE_URL is required for integration tests")

const databaseName = new URL(connectionString).pathname.slice(1)
if (databaseName !== "scouty_test") {
  throw new Error(`Integration tests refuse to reset non-test database: ${databaseName}`)
}

const database = createPrismaClient(connectionString)
const peerDatabase = createPrismaClient(connectionString)

async function resetDatabase() {
  await database.$executeRawUnsafe(
    'TRUNCATE TABLE "users", "role_groups", "tags" RESTART IDENTITY CASCADE',
  )
}

function createService(databaseClient = database) {
  const statement = {
    bind: () => ({ run: async () => ({ success: true }) }),
  }
  return new PrismaCoreService({
    apiOrigin: "https://api.greeney.life",
    assets: {} as R2Bucket,
    database: databaseClient,
    edgeDatabase: {
      batch: async () => [],
      prepare: () => statement,
    } as unknown as D1Database,
    processingQueue: {} as Queue<{ portfolioId: string; requestedAt: string }>,
    signer: {
      signGet: async () => "https://assets.example/file",
      signPut: async () => ({ headers: {}, url: "https://assets.example/file" }),
    },
  })
}

function expectRejectedWithCode(result: PromiseSettledResult<unknown>, code: string) {
  expect(result.status).toBe("rejected")
  if (result.status === "rejected") expect(result.reason).toMatchObject({ code })
}

describe("PostgreSQL engagement lifecycle", () => {
  beforeAll(resetDatabase)

  afterAll(async () => {
    await resetDatabase()
    await database.$disconnect()
    await peerDatabase.$disconnect()
  })

  it("enforces proposal, chat, manner, block, report, and moderation invariants", async () => {
    const group = await database.roleGroup.create({
      data: { name: "개발", slug: "development", sortOrder: 1 },
    })
    const role = await database.role.create({
      data: { groupId: group.id, name: "백엔드", slug: "backend", sortOrder: 1 },
    })

    async function createMember(subject: string, handle: string) {
      const user = await database.user.create({
        data: {
          authProvider: "google",
          authSubject: subject,
          email: `${handle}@example.com`,
          scoutStats: { create: {} },
        },
      })
      const avatar = await database.asset.create({
        data: {
          byteSize: 128n,
          kind: AssetKind.AVATAR,
          mimeType: "image/webp",
          ownerId: user.id,
          status: AssetStatus.READY,
          storageKey: `integration/${user.id}/avatar.webp`,
        },
      })
      await database.userProfile.create({
        data: {
          avatarAssetId: avatar.id,
          bio: "함께 결과를 만드는 사람입니다.",
          handle,
          nickname: handle,
          profileCompletedAt: new Date(),
          scoutStatus: ScoutStatus.OPEN,
          userId: user.id,
        },
      })
      await database.userRole.create({
        data: { priority: 1, roleId: role.id, userId: user.id },
      })
      return user
    }

    async function createPublishedPortfolio(userId: string, title: string) {
      const pdf = await database.asset.create({
        data: {
          byteSize: 1024n,
          kind: AssetKind.PORTFOLIO_PDF,
          mimeType: "application/pdf",
          ownerId: userId,
          status: AssetStatus.READY,
          storageKey: `integration/${userId}/${crypto.randomUUID()}.pdf`,
        },
      })
      return database.portfolio.create({
        data: {
          authorId: userId,
          pageCount: 1,
          pdfAssetId: pdf.id,
          publishedAt: new Date(),
          roles: { create: { roleId: role.id } },
          status: PortfolioStatus.PUBLISHED,
          title,
        },
      })
    }

    const sender = await createMember("integration-sender", "sender")
    const recipient = await createMember("integration-recipient", "recipient")
    const admin = await database.user.create({
      data: {
        authProvider: "google",
        authSubject: "integration-admin",
        isAdmin: true,
      },
    })
    await createPublishedPortfolio(sender.id, "보낸 사람 프로젝트")
    const source = await createPublishedPortfolio(recipient.id, "받는 사람 프로젝트")
    const service = createService()
    const peerService = createService(peerDatabase)
    const proposal = {
      estimatedPeriodText: "8주",
      message: "함께 좋은 결과를 만들고 싶어요.",
      projectSummary: "사용자가 바로 이해하는 서비스를 만들어요.",
      projectTitle: "Scouty 통합 테스트",
      requestedRoleSlug: role.slug,
      sourcePortfolioId: source.id,
      teamCompositionText: "기획자 1명, 디자이너 1명",
      weeklyCommitmentText: "주 8시간",
    }

    const proposals = await Promise.allSettled([
      service.createScoutRequest(sender.id, proposal),
      peerService.createScoutRequest(sender.id, proposal),
    ])
    const createdProposal = proposals.find((result) => result.status === "fulfilled")
    const duplicateProposal = proposals.find((result) => result.status === "rejected")
    expect(createdProposal?.status).toBe("fulfilled")
    if (createdProposal?.status !== "fulfilled") throw new Error("Proposal was not created")
    if (!duplicateProposal) throw new Error("Duplicate proposal unexpectedly succeeded")
    expectRejectedWithCode(duplicateProposal, "PENDING_SCOUT_EXISTS")
    expect(await database.scoutRequest.count()).toBe(1)

    const transitions = await Promise.allSettled([
      service.transitionScoutRequest(recipient.id, createdProposal.value.id, "accept"),
      peerService.transitionScoutRequest(recipient.id, createdProposal.value.id, "accept"),
    ])
    const accepted = transitions.find((result) => result.status === "fulfilled")
    const duplicateAccept = transitions.find((result) => result.status === "rejected")
    expect(accepted?.status).toBe("fulfilled")
    if (accepted?.status !== "fulfilled" || !accepted.value.chatRoomId) {
      throw new Error("Proposal was not accepted")
    }
    if (!duplicateAccept) throw new Error("Duplicate acceptance unexpectedly succeeded")
    expectRejectedWithCode(duplicateAccept, "SCOUT_ALREADY_RESOLVED")
    expect(await database.chatRoom.count()).toBe(1)
    expect(await database.chatMessage.count({ where: { senderId: null } })).toBe(1)

    const clientMessageId = crypto.randomUUID()
    const sentMessages = await Promise.all([
      service.sendChatMessage(sender.id, accepted.value.chatRoomId, {
        body: "안녕하세요. 함께 이야기해봐요.",
        clientMessageId,
      }),
      peerService.sendChatMessage(sender.id, accepted.value.chatRoomId, {
        body: "안녕하세요. 함께 이야기해봐요.",
        clientMessageId,
      }),
    ])
    expect(sentMessages[0].id).toBe(sentMessages[1].id)
    expect(await database.chatMessage.count({ where: { clientMessageId } })).toBe(1)

    await service.sendChatMessage(recipient.id, accepted.value.chatRoomId, {
      body: "좋아요. 구체적으로 이야기해요.",
      clientMessageId: crypto.randomUUID(),
    })
    expect(await service.getUnreadCounts(recipient.id)).toMatchObject({ chat: 1, requests: 0 })

    const feedback = await Promise.allSettled([
      service.submitMannerFeedback(sender.id, createdProposal.value.id, "positive"),
      peerService.submitMannerFeedback(sender.id, createdProposal.value.id, "positive"),
    ])
    expect(feedback.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const duplicateFeedback = feedback.find((result) => result.status === "rejected")
    if (!duplicateFeedback) throw new Error("Duplicate manner feedback unexpectedly succeeded")
    expectRejectedWithCode(duplicateFeedback, "MANNER_ALREADY_SUBMITTED")
    const recipientStats = await database.userScoutStats.findUniqueOrThrow({
      where: { userId: recipient.id },
    })
    expect(recipientStats.mannerEvaluationCount).toBe(1)
    expect(Number(recipientStats.mannerTemperature)).toBe(38.8)

    await service.setBlock(sender.id, recipient.id, true)
    expect(await service.listExcludedDiscoveryAuthors(sender.id)).toContain(recipient.id)
    await expect(
      service.sendChatMessage(recipient.id, accepted.value.chatRoomId, {
        body: "차단 후에는 보내지지 않아야 해요.",
        clientMessageId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CHAT_READ_ONLY" })

    const report = await service.report(sender.id, {
      reasonCode: "spam",
      targetId: recipient.id,
      targetType: "user",
    })
    await expect(service.moderateReport(sender.id, report.id, "reviewing")).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    })
    await service.moderateReport(admin.id, report.id, "reviewing")
    expect((await database.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe(
      ReportStatus.REVIEWING,
    )
    await service.moderatePortfolio(admin.id, source.id)
    expect((await database.portfolio.findUniqueOrThrow({ where: { id: source.id } })).status).toBe(
      PortfolioStatus.ARCHIVED,
    )
    expect(await database.notification.count()).toBeGreaterThan(0)
    expect(await database.mannerFeedback.count()).toBe(1)
    expect(
      await database.scoutRequest.count({ where: { status: ScoutRequestStatus.ACCEPTED } }),
    ).toBe(1)
  })
})
