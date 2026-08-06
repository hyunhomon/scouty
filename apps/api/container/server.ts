import { mkdir, readdir, rm } from "node:fs/promises"
import { AwsClient } from "aws4fetch"

type ProcessRequest = {
  outputPrefix: string
  pdfUrl: string
  portfolioId: string
}

const accessKeyId = process.env.R2_ACCESS_KEY_ID
const accountId = process.env.R2_ACCOUNT_ID
const bucketName = process.env.R2_BUCKET_NAME
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

if (!accessKeyId || !accountId || !bucketName || !secretAccessKey) {
  throw new Error("R2 credentials are required")
}

const r2 = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" })

async function run(command: string[]) {
  const process = Bun.spawn(command, { stderr: "pipe", stdout: "pipe" })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`${command[0]} failed: ${stderr}`)
  return stdout
}

function objectUrl(storageKey: string) {
  const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/")
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodedKey}`
}

async function upload(storageKey: string, filePath: string) {
  const file = Bun.file(filePath)
  const response = await r2.fetch(objectUrl(storageKey), {
    method: "PUT",
    headers: { "content-type": "image/webp" },
    body: file,
  })
  if (!response.ok) throw new Error(`R2 upload failed with ${response.status}`)
  return file.size
}

async function processPdf(input: ProcessRequest) {
  if (!/^[0-9a-f-]{36}$/i.test(input.portfolioId)) throw new Error("Invalid portfolio ID")
  if (!input.outputPrefix.endsWith("/pages")) throw new Error("Invalid output prefix")

  const workDirectory = `/tmp/scouty-${input.portfolioId}`
  await mkdir(workDirectory, { recursive: true })

  try {
    const pdfResponse = await fetch(input.pdfUrl)
    if (!pdfResponse.ok) throw new Error(`PDF download failed with ${pdfResponse.status}`)
    const pdfBytes = await pdfResponse.arrayBuffer()
    if (pdfBytes.byteLength > 50 * 1024 * 1024) throw new Error("PDF is too large")

    const pdfPath = `${workDirectory}/source.pdf`
    await Bun.write(pdfPath, pdfBytes)
    const info = await run(["pdfinfo", pdfPath])
    const pageCount = Number(/^Pages:\s+(\d+)$/m.exec(info)?.[1])
    if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 50) {
      throw new Error("PDF page count must be between 1 and 50")
    }

    await run([
      "pdftoppm",
      "-webp",
      "-r",
      "144",
      "-scale-to-x",
      "1600",
      "-scale-to-y",
      "-1",
      pdfPath,
      `${workDirectory}/page`,
    ])

    const imageFiles = (await readdir(workDirectory))
      .filter((name) => /^page-\d+\.webp$/.test(name))
      .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
    if (imageFiles.length !== pageCount) throw new Error("Rendered page count mismatch")

    const pages = []
    for (const [index, imageFile] of imageFiles.entries()) {
      const pageNumber = index + 1
      const imagePath = `${workDirectory}/${imageFile}`
      const thumbnailPath = `${workDirectory}/thumbnail-${pageNumber}.webp`
      await run(["cwebp", "-quiet", "-resize", "800", "0", imagePath, "-o", thumbnailPath])
      const dimensions = await run(["identify", "-format", "%w %h", imagePath])
      const [width, height] = dimensions.trim().split(/\s+/).map(Number)
      if (!width || !height) throw new Error("Unable to read rendered dimensions")

      const imageStorageKey = `${input.outputPrefix}/${pageNumber}.webp`
      const thumbnailStorageKey = `${input.outputPrefix}/${pageNumber}-thumbnail.webp`
      const [imageByteSize, thumbnailByteSize] = await Promise.all([
        upload(imageStorageKey, imagePath),
        upload(thumbnailStorageKey, thumbnailPath),
      ])
      pages.push({
        height,
        imageByteSize,
        imageMimeType: "image/webp" as const,
        imageStorageKey,
        pageNumber,
        thumbnailByteSize,
        thumbnailMimeType: "image/webp" as const,
        thumbnailStorageKey,
        width,
      })
    }

    return { pageCount, pages }
  } finally {
    await rm(workDirectory, { force: true, recursive: true })
  }
}

Bun.serve({
  port: 8080,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/health") return Response.json({ status: "ok" })
    if (request.method !== "POST" || url.pathname !== "/process") {
      return new Response("Not found", { status: 404 })
    }
    try {
      const result = await processPdf((await request.json()) as ProcessRequest)
      return Response.json(result)
    } catch (error) {
      console.error(error instanceof Error ? error.message : "media processing failed")
      return Response.json({ code: "PROCESSING_FAILED" }, { status: 422 })
    }
  },
})
