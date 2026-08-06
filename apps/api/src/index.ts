import { env } from "cloudflare:workers"
import { createPrismaClient } from "@scouty/db"
import { createApp } from "./app"
import { ChatRoomHub } from "./chat-room"
import { ApiError, type CompletePortfolioProcessingInput } from "./core"
import { PrismaCoreService } from "./core-prisma"
import { D1DiscoveryRepository } from "./discovery"
import { PortfolioMediaContainer } from "./media-container"
import { checkReadiness } from "./readiness"
import { R2UploadSigner } from "./security"

const database = env.HYPERDRIVE ? createPrismaClient(env.HYPERDRIVE.connectionString) : null

const signer =
  env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
    ? new R2UploadSigner({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        accountId: "d09b11497e0618d6dceff0559855a7b2",
        bucketName: env.R2_BUCKET_NAME,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      })
    : {
        async signGet() {
          throw new ApiError(503, "R2_SIGNING_UNAVAILABLE", "파일 서명 설정을 준비하고 있어요.")
        },
        async signPut() {
          throw new ApiError(503, "R2_SIGNING_UNAVAILABLE", "파일 서명 설정을 준비하고 있어요.")
        },
      }

const processor = {
  async inspectVideo(input: { portfolioId: string; videoUrl: string }) {
    const stub = env.MEDIA_PROCESSOR.get(env.MEDIA_PROCESSOR.idFromName(input.portfolioId))
    const response = await stub.fetch("http://container/inspect-video", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error(`Media processor failed with ${response.status}`)
    return (await response.json()) as { durationSeconds: number }
  },
  async process(input: {
    outputPrefix: string
    pdfUrl: string
    portfolioId: string
    videoUrl?: string
  }) {
    const stub = env.MEDIA_PROCESSOR.get(env.MEDIA_PROCESSOR.idFromName(input.portfolioId))
    const response = await stub.fetch("http://container/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error(`Media processor failed with ${response.status}`)
    return (await response.json()) as CompletePortfolioProcessingInput
  },
}

const core = database
  ? new PrismaCoreService({
      apiOrigin: env.API_ORIGIN,
      assets: env.ASSETS,
      database,
      edgeDatabase: env.EDGE_DB,
      notifyChat: async (roomId, message) => {
        const stub = env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(roomId))
        await stub.fetch("https://chat.internal/notify", {
          method: "POST",
          body: JSON.stringify(message),
        })
      },
      processingQueue: env.PORTFOLIO_PROCESSING,
      processor,
      signer,
    })
  : undefined

const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.OAUTH_STATE_SECRET
    ? {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: `${env.API_ORIGIN}/v1/auth/google/callback`,
        stateSecret: env.OAUTH_STATE_SECRET,
      }
    : undefined

const app = createApp({
  assets: env.ASSETS,
  chatRooms: env.CHAT_ROOMS,
  cookieDomain: env.COOKIE_DOMAIN,
  ...(core ? { core } : {}),
  corsOrigins: env.CORS_ORIGINS,
  discovery: new D1DiscoveryRepository(env.EDGE_DB),
  ...(google ? { google } : {}),
  readiness: () => checkReadiness(env),
  webOrigin: env.WEB_ORIGIN,
})

const handler = app.compile()

export { ChatRoomHub, PortfolioMediaContainer }

export default {
  fetch: handler.fetch,
  async queue(batch: MessageBatch<{ portfolioId: string }>) {
    for (const message of batch.messages) {
      if (!core) {
        message.retry()
        continue
      }
      try {
        await core.processPortfolio(message.body.portfolioId)
        message.ack()
      } catch {
        message.retry()
      }
    }
  },
  async scheduled(controller: ScheduledController) {
    if (controller.cron === "15 3 * * *") await core?.rebuildDiscoveryProjection()
    else await core?.recomputeScoutStats()
  },
}
