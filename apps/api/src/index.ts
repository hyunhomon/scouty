import { env } from "cloudflare:workers"
import { createApp } from "./app"
import { checkReadiness } from "./readiness"

const app = createApp({
  corsOrigins: env.CORS_ORIGINS,
  readiness: () => checkReadiness(env),
})

export default app.compile()
