import { AwsClient } from "aws4fetch"
import { ApiError, isAllowedReturnPath } from "./core"

const textEncoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function createRandomToken(byteLength = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  )
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function verifyHmac(value: string, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"],
  )
  return crypto.subtle.verify("HMAC", key, fromBase64Url(signature), textEncoder.encode(value))
}

export async function createOAuthState(secret: string, returnTo?: string) {
  const payload = toBase64Url(
    textEncoder.encode(
      JSON.stringify({
        expiresAt: Date.now() + 10 * 60 * 1000,
        nonce: createRandomToken(16),
        returnTo: isAllowedReturnPath(returnTo),
      }),
    ),
  )
  return `${payload}.${await hmac(payload, secret)}`
}

export async function verifyOAuthState(value: string, secret: string) {
  const [payload, signature] = value.split(".")
  let isValid = false
  if (payload && signature) {
    try {
      isValid = await verifyHmac(payload, signature, secret)
    } catch {
      isValid = false
    }
  }
  if (!isValid || !payload) {
    throw new ApiError(400, "INVALID_OAUTH_STATE", "로그인 요청이 만료되었어요.")
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      expiresAt?: number
      returnTo?: string
    }
    if (!parsed.expiresAt || parsed.expiresAt < Date.now()) throw new Error("expired")
    return { returnTo: isAllowedReturnPath(parsed.returnTo) }
  } catch {
    throw new ApiError(400, "INVALID_OAUTH_STATE", "로그인 요청이 만료되었어요.")
  }
}

export function createGoogleAuthorizationUrl(input: {
  clientId: string
  redirectUri: string
  state: string
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.searchParams.set("client_id", input.clientId)
  url.searchParams.set("redirect_uri", input.redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "openid email")
  url.searchParams.set("state", input.state)
  url.searchParams.set("prompt", "select_account")
  return url.toString()
}

export async function exchangeGoogleCode(input: {
  clientId: string
  clientSecret: string
  code: string
  redirectUri: string
}) {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    }),
  })

  if (!tokenResponse.ok) {
    throw new ApiError(401, "OAUTH_EXCHANGE_FAILED", "Google 로그인을 완료하지 못했어요.")
  }

  const token = (await tokenResponse.json()) as { access_token?: string }
  if (!token.access_token) {
    throw new ApiError(401, "OAUTH_EXCHANGE_FAILED", "Google 로그인을 완료하지 못했어요.")
  }

  const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  })
  if (!userResponse.ok) {
    throw new ApiError(401, "OAUTH_PROFILE_FAILED", "Google 프로필을 확인하지 못했어요.")
  }

  const user = (await userResponse.json()) as { email?: string; sub?: string }
  if (!user.sub) {
    throw new ApiError(401, "OAUTH_PROFILE_FAILED", "Google 프로필을 확인하지 못했어요.")
  }

  return { email: user.email ?? null, subject: user.sub }
}

export class R2UploadSigner {
  private readonly client: AwsClient

  constructor(
    private readonly input: {
      accessKeyId: string
      accountId: string
      bucketName: string
      secretAccessKey: string
    },
  ) {
    this.client = new AwsClient({
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      region: "auto",
      service: "s3",
    })
  }

  async signPut(storageKey: string, contentType: string, expiresInSeconds = 900) {
    const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/")
    const url = new URL(
      `https://${this.input.accountId}.r2.cloudflarestorage.com/${this.input.bucketName}/${encodedKey}`,
    )
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds))

    const request = await this.client.sign(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      aws: { signQuery: true },
    })

    return { headers: { "content-type": contentType }, url: request.url }
  }

  async signGet(storageKey: string, expiresInSeconds = 900) {
    const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/")
    const url = new URL(
      `https://${this.input.accountId}.r2.cloudflarestorage.com/${this.input.bucketName}/${encodedKey}`,
    )
    url.searchParams.set("X-Amz-Expires", String(expiresInSeconds))
    const request = await this.client.sign(url, { method: "GET", aws: { signQuery: true } })
    return request.url
  }
}
