declare namespace Cloudflare {
  interface Env {
    ASSETS: R2Bucket
    CORS_ORIGINS: string
    EDGE_DB: D1Database
    HYPERDRIVE: Hyperdrive
  }
}

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Cloudflare.Env {}
}
