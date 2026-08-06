export type DependencyName = "d1" | "r2" | "oauth" | "r2Signing" | "queue"

export type ReadinessResult = {
  status: "ok" | "degraded"
  checks: Record<DependencyName, "ok" | "error">
}

async function checkD1(database: D1Database) {
  await database.prepare("SELECT id FROM roles LIMIT 1").first()
}

async function checkR2(bucket: R2Bucket) {
  await bucket.head("__scouty_readiness__")
}

async function checkConfiguration(name: string, ...values: unknown[]) {
  if (values.some((value) => !value)) throw new Error(`${name} is not configured`)
}

export async function checkReadiness(bindings: Cloudflare.Env): Promise<ReadinessResult> {
  const names: DependencyName[] = ["d1", "r2", "oauth", "r2Signing", "queue"]
  const results = await Promise.allSettled([
    checkD1(bindings.DB),
    checkR2(bindings.ASSETS),
    checkConfiguration(
      "OAuth",
      bindings.GOOGLE_CLIENT_ID,
      bindings.GOOGLE_CLIENT_SECRET,
      bindings.OAUTH_STATE_SECRET,
    ),
    checkConfiguration("R2 signing", bindings.R2_ACCESS_KEY_ID, bindings.R2_SECRET_ACCESS_KEY),
    checkConfiguration("Portfolio processing queue", bindings.PORTFOLIO_PROCESSING),
  ])

  const checks = Object.fromEntries(
    names.map((name, index) => [name, results[index]?.status === "fulfilled" ? "ok" : "error"]),
  ) as ReadinessResult["checks"]

  return {
    status: Object.values(checks).every((status) => status === "ok") ? "ok" : "degraded",
    checks,
  }
}
