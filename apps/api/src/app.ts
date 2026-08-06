import { openapi } from "@elysia/openapi"
import { cors } from "@elysiajs/cors"
import { Elysia, t } from "elysia"
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker"
import type { ReadinessResult } from "./readiness"

const defaultReadiness: ReadinessResult = {
  status: "degraded",
  checks: { postgres: "error", d1: "error", r2: "error" },
}

const readinessSchema = t.Object({
  status: t.Union([t.Literal("ok"), t.Literal("degraded")]),
  checks: t.Object({
    postgres: t.Union([t.Literal("ok"), t.Literal("error")]),
    d1: t.Union([t.Literal("ok"), t.Literal("error")]),
    r2: t.Union([t.Literal("ok"), t.Literal("error")]),
  }),
})

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
      openapi({
        path: "/docs",
        documentation: {
          info: {
            title: "Scouty API",
            version: "0.1.0",
            description: "결과물로 시작하는 대학생 팀빌딩 서비스 API",
          },
          servers: [{ url: "https://api.greeney.life", description: "Production" }],
          tags: [{ name: "System", description: "서비스 상태 확인" }],
        },
      }),
    )
    .use(
      cors({
        origin: parseCorsOrigins(options.corsOrigins),
      }),
    )
    .get("/", () => ({ name: "scouty-api", status: "ok" }) as const, {
      response: t.Object({ name: t.Literal("scouty-api"), status: t.Literal("ok") }),
      detail: { summary: "API 정보", tags: ["System"] },
    })
    .get("/health", () => ({ status: "ok" as const }), {
      response: t.Object({ status: t.Literal("ok") }),
      detail: { summary: "Liveness 확인", tags: ["System"] },
    })
    .get(
      "/ready",
      async ({ status }) => {
        const result = await readiness()

        if (result.status !== "ok") {
          return status(503, result)
        }

        return result
      },
      {
        response: { 200: readinessSchema, 503: readinessSchema },
        detail: {
          summary: "Readiness 확인",
          description: "PostgreSQL, D1, R2 바인딩의 준비 상태를 확인합니다.",
          tags: ["System"],
        },
      },
    )
}

export type App = ReturnType<typeof createApp>
