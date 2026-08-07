import { apiUrl } from "@/lib/api"

const RETRY_DELAYS_MS = [150, 400]
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

function isReadRequest(init?: RequestInit) {
  const method = init?.method?.toUpperCase() ?? "GET"
  return method === "GET" || method === "HEAD"
}

function delay(milliseconds: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

async function fetchWithRetry(url: string, init?: RequestInit) {
  const canRetry = isReadRequest(init)
  let lastError: unknown

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url, init)
      if (
        canRetry &&
        RETRYABLE_STATUS_CODES.has(response.status) &&
        attempt < RETRY_DELAYS_MS.length
      ) {
        await delay(RETRY_DELAYS_MS[attempt] ?? 0)
        continue
      }
      return response
    } catch (error) {
      lastError = error
      if (!canRetry || attempt >= RETRY_DELAYS_MS.length) break
      await delay(RETRY_DELAYS_MS[attempt] ?? 0)
    }
  }

  throw new ApiRequestError(
    0,
    "서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해주세요.",
    { cause: lastError },
  )
}

export async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json")

  const response = await fetchWithRetry(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  })
  const responseText = response.status === 204 ? "" : await response.text()
  let responseBody: unknown = null

  if (responseText) {
    try {
      responseBody = JSON.parse(responseText)
    } catch (error) {
      if (response.ok) {
        throw new ApiRequestError(
          502,
          "서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해주세요.",
          { cause: error },
        )
      }
    }
  }

  if (!response.ok) {
    const body = responseBody as { message?: string } | null
    throw new ApiRequestError(response.status, body?.message ?? "요청을 처리하지 못했어요.")
  }
  if (response.status === 204) return undefined as T
  return responseBody as T
}

export async function uploadFile(url: string, file: File, headers: HeadersInit, label = "파일") {
  let response: Response
  try {
    response = await fetch(url, { body: file, headers, method: "PUT" })
  } catch (error) {
    throw new ApiRequestError(
      0,
      `${label} 업로드 서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해주세요.`,
      { cause: error },
    )
  }

  if (!response.ok) {
    throw new ApiRequestError(response.status, `${label} 업로드에 실패했어요.`)
  }
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
