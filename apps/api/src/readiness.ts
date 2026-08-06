import { createPrismaClient } from "@scouty/db"

export type DependencyName = "postgres" | "d1" | "r2"

export type ReadinessResult = {
  status: "ok" | "degraded"
  checks: Record<DependencyName, "ok" | "error">
}

async function checkPostgres(connectionString: string) {
  const prisma = createPrismaClient(connectionString)

  try {
    await prisma.$queryRaw`SELECT 1`
  } finally {
    await prisma.$disconnect()
  }
}

async function checkD1(database: D1Database) {
  await database.prepare("SELECT 1 AS ok").first()
}

async function checkR2(bucket: R2Bucket) {
  await bucket.head("__scouty_readiness__")
}

export async function checkReadiness(bindings: Cloudflare.Env): Promise<ReadinessResult> {
  const names: DependencyName[] = ["postgres", "d1", "r2"]
  const results = await Promise.allSettled([
    checkPostgres(bindings.HYPERDRIVE.connectionString),
    checkD1(bindings.EDGE_DB),
    checkR2(bindings.ASSETS),
  ])

  const checks = Object.fromEntries(
    names.map((name, index) => [name, results[index]?.status === "fulfilled" ? "ok" : "error"]),
  ) as ReadinessResult["checks"]

  return {
    status: Object.values(checks).every((status) => status === "ok") ? "ok" : "degraded",
    checks,
  }
}
