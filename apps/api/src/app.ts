import { cors } from "@elysiajs/cors"
import { Elysia } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"
import type { ReadinessResult } from "./readiness"

const defaultReadiness: ReadinessResult = {
  status: "degraded",
  checks: { postgres: "error", d1: "error", r2: "error" },
}

export type CreateAppOptions = {
  aot?: boolean
  corsOrigins?: string
  readiness?: () => Promise<ReadinessResult>
}

export function parseCorsOrigins(origins = "") {
  return origins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function createApp(options: CreateAppOptions = {}) {
  const readiness = options.readiness ?? (async () => defaultReadiness)

  return new Elysia({ adapter: CloudflareAdapter, aot: options.aot ?? true })
    .use(
      cors({
        origin: parseCorsOrigins(options.corsOrigins),
      }),
    )
    .get("/", () => ({ name: "scouty-api", status: "ok" }))
    .get("/health", () => ({ status: "ok" as const }))
    .get("/ready", async ({ status }) => {
      const result = await readiness()

      if (result.status !== "ok") {
        return status(503, result)
      }

      return result
    })
}

export type App = ReturnType<typeof createApp>
