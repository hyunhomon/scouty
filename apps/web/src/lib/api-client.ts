import { apiUrl } from "@/lib/api"

const RETRY_DELAYS_MS = [150, 400]
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])
const MULTIPART_THRESHOLD_BYTES = 50 * 1024 * 1024
const MULTIPART_PART_BYTES = 10 * 1024 * 1024

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

async function uploadRequest(url: string, init: RequestInit, label: string) {
  let response: Response
  try {
    response = await fetch(url, { ...init, credentials: "include" })
  } catch (error) {
    throw new ApiRequestError(
      0,
      `${label} 업로드 서버에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 시도해주세요.`,
      { cause: error },
    )
  }

  if (!response.ok) {
    let message = `${label} 업로드에 실패했어요.`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // R2 and edge errors may not include a JSON response.
    }
    throw new ApiRequestError(response.status, message)
  }
  return response
}

async function uploadMultipart(url: string, file: File, headers: HeadersInit, label: string) {
  const multipartUrl = `${url}/multipart`
  const startResponse = await uploadRequest(multipartUrl, { method: "POST" }, label)
  const start = (await startResponse.json()) as { uploadId?: string }
  if (!start.uploadId) {
    throw new ApiRequestError(502, `${label} 업로드를 시작하지 못했어요.`)
  }

  const uploadedParts: Array<{ etag: string; partNumber: number }> = []
  try {
    const partCount = Math.ceil(file.size / MULTIPART_PART_BYTES)
    for (let index = 0; index < partCount; index += 1) {
      const partNumber = index + 1
      const partUrl = new URL(multipartUrl)
      partUrl.searchParams.set("uploadId", start.uploadId)
      partUrl.searchParams.set("partNumber", String(partNumber))
      const part = file.slice(
        index * MULTIPART_PART_BYTES,
        Math.min((index + 1) * MULTIPART_PART_BYTES, file.size),
        file.type,
      )
      const partResponse = await uploadRequest(
        partUrl.toString(),
        { body: part, headers, method: "PUT" },
        label,
      )
      const uploadedPart = (await partResponse.json()) as {
        etag?: string
        partNumber?: number
      }
      if (!uploadedPart.etag || uploadedPart.partNumber !== partNumber) {
        throw new ApiRequestError(502, `${label} 업로드 응답을 확인하지 못했어요.`)
      }
      uploadedParts.push({ etag: uploadedPart.etag, partNumber })
    }

    await uploadRequest(
      `${multipartUrl}/complete`,
      {
        body: JSON.stringify({ parts: uploadedParts, uploadId: start.uploadId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
      label,
    )
  } catch (error) {
    const abortUrl = new URL(multipartUrl)
    abortUrl.searchParams.set("uploadId", start.uploadId)
    await fetch(abortUrl, { credentials: "include", method: "DELETE" }).catch(() => undefined)
    throw error
  }
}

export async function uploadFile(url: string, file: File, headers: HeadersInit, label = "파일") {
  if (file.size > MULTIPART_THRESHOLD_BYTES) {
    await uploadMultipart(url, file, headers, label)
    return
  }

  await uploadRequest(url, { body: file, headers, method: "PUT" }, label)
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
