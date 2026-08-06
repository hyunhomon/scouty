import { Container } from "@cloudflare/containers"

export class PortfolioMediaContainer extends Container<Cloudflare.Env> {
  override defaultPort = 8080
  override sleepAfter = "5m"

  constructor(ctx: DurableObjectState<Record<string, never>>, env: Cloudflare.Env) {
    super(ctx, env)
    this.envVars = {
      R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID ?? "",
      R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
      R2_BUCKET_NAME: env.R2_BUCKET_NAME,
      R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY ?? "",
    }
  }
}
