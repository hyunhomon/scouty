declare namespace Cloudflare {
  interface Env {
    ASSETS: R2Bucket
    API_ORIGIN: string
    CHAT_ROOMS: DurableObjectNamespace
    COOKIE_DOMAIN: string
    CORS_ORIGINS: string
    DB: D1Database
    GOOGLE_CLIENT_ID?: string
    GOOGLE_CLIENT_SECRET?: string
    MEDIA_PROCESSOR: DurableObjectNamespace
    OAUTH_STATE_SECRET?: string
    PORTFOLIO_PROCESSING: Queue
    R2_ACCESS_KEY_ID?: string
    R2_ACCOUNT_ID: string
    R2_BUCKET_NAME: string
    R2_SECRET_ACCESS_KEY?: string
    WEB_ORIGIN: string
  }
}

declare module "cloudflare:workers" {
  interface ProvidedEnv extends Cloudflare.Env {}
}
