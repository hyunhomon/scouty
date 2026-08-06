import { env } from "cloudflare:workers"
import { createApp } from "./app"
import { D1DiscoveryRepository } from "./discovery"
import { checkReadiness } from "./readiness"

const app = createApp({
  corsOrigins: env.CORS_ORIGINS,
  discovery: new D1DiscoveryRepository(env.EDGE_DB),
  readiness: () => checkReadiness(env),
})

export default app.compile()
