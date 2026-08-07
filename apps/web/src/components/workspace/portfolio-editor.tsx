import type { AssetUploadTicket, PortfolioSummary, PortfolioUploadTicket } from "@scouty/api"
import { FileUp } from "lucide-react"
import { type SubmitEvent, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FilePicker } from "@/components/ui/file-picker"
import { Field, inputClass } from "@/components/ui/form-controls"
import { errorMessage, request, uploadFile } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { readVideoDuration } from "./media"
import type { Role } from "./types"

export function PortfolioUploader({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const pdf = form.get("pdf")
    const video = form.get("video")
    if (!(pdf instanceof File) || pdf.size === 0) return
    setIsSubmitting(true)
    setError(undefined)
    let portfolioId: string | undefined
    try {
      const videoDurationSeconds =
        video instanceof File && video.size > 0 ? await readVideoDuration(video) : null
      if (videoDurationSeconds && videoDurationSeconds > 180) {
        throw new Error("영상은 최대 3분까지 올릴 수 있어요.")
      }
      const ticket = await request<PortfolioUploadTicket>("/v1/me/portfolios", {
        method: "POST",
        body: JSON.stringify({
          pdf: { byteSize: pdf.size, mimeType: "application/pdf" },
          roleSlugs: selectedRoles,
          tags: String(form.get("tags") ?? "").split(","),
          title: form.get("title"),
          ...(video instanceof File && video.size > 0
            ? {
                video: {
                  byteSize: video.size,
                  durationSeconds: videoDurationSeconds,
                  mimeType: video.type,
                },
              }
            : {}),
        }),
      })
      portfolioId = ticket.portfolioId
      for (const upload of ticket.uploads) {
        const file = upload.kind === "pdf" ? pdf : video
        if (!(file instanceof File)) continue
        await uploadFile(upload.url, file, upload.headers, upload.kind === "pdf" ? "PDF" : "영상")
      }
      await request(`/v1/me/portfolios/${ticket.portfolioId}/uploads/complete`, { method: "POST" })
      portfolioId = undefined
      formElement.reset()
      setSelectedRoles([])
      onCreated()
    } catch (caught) {
      if (portfolioId) {
        await request(`/v1/me/portfolios/${portfolioId}/uploads`, { method: "DELETE" }).catch(
          () => undefined,
        )
      }
      setError(errorMessage(caught, "프로젝트를 등록하지 못했어요."))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="rounded-2xl p-5 shadow-none">
      <h2 className="text-lg font-extrabold">새 프로젝트 추가</h2>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <Field label="제목">
          <input
            className={inputClass}
            name="title"
            maxLength={60}
            placeholder="예: 지역 기반 러닝 크루 앱"
            required
          />
        </Field>
        <Field label="PDF">
          <FilePicker
            name="pdf"
            accept="application/pdf"
            actionLabel="포트폴리오 PDF 선택"
            helperText="프로젝트 결과를 보여주는 PDF를 선택해주세요."
            required
          />
        </Field>
        <Field label="영상 (선택)">
          <FilePicker
            name="video"
            accept="video/mp4,video/webm,video/quicktime"
            actionLabel="소개 영상 선택"
            helperText="MP4, WebM, MOV · 최대 3분"
          />
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">프로젝트에서 맡은 역할</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((role) => (
              <button
                key={role.slug}
                type="button"
                aria-pressed={selectedRoles.includes(role.slug)}
                onClick={() =>
                  setSelectedRoles((current) =>
                    current.includes(role.slug)
                      ? current.filter((value) => value !== role.slug)
                      : current.length < 3
                        ? [...current, role.slug]
                        : current,
                  )
                }
                className={cn(
                  "rounded-full border px-3 py-2 text-sm",
                  selectedRoles.includes(role.slug) &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {role.name}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="태그 1~5개 (쉼표로 구분)">
          <input className={inputClass} name="tags" placeholder="핀테크, 모바일" required />
        </Field>
        {error ? (
          <p className="text-sm text-destructive" role="status" aria-live="polite">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={isSubmitting || selectedRoles.length === 0}>
          <FileUp aria-hidden="true" /> {isSubmitting ? "올리고 있어요" : "프로젝트 등록"}
        </Button>
      </form>
    </Card>
  )
}

export function PortfolioCard({
  onRefresh,
  portfolio,
  roles,
}: {
  onRefresh: () => Promise<void>
  portfolio: PortfolioSummary
  roles: Role[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isMediaUpdating, setIsMediaUpdating] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState(portfolio.roles.map((role) => role.slug))
  const [message, setMessage] = useState<string>()
  const statusLabel = {
    archived: "보관됨",
    draft: "업로드 대기",
    failed: "처리 실패",
    processing: "처리 중",
    published: "게시됨",
    ready: "게시 준비 완료",
  }[portfolio.status]

  async function action(value: "archive" | "publish" | "retry") {
    try {
      await request(`/v1/me/portfolios/${portfolio.id}/${value}`, { method: "POST" })
      await onRefresh()
    } catch (error) {
      setMessage(errorMessage(error, "프로젝트 상태를 바꾸지 못했어요."))
    }
  }

  async function replacePdf(file: File) {
    setIsMediaUpdating(true)
    setMessage(undefined)
    let ticketCreated = false
    try {
      const ticket = await request<AssetUploadTicket>(
        `/v1/me/portfolios/${portfolio.id}/pdf-replacements`,
        {
          method: "POST",
          body: JSON.stringify({ byteSize: file.size, mimeType: "application/pdf" }),
        },
      )
      ticketCreated = true
      await uploadFile(ticket.url, file, ticket.headers, "새 PDF")
      await request(
        `/v1/me/portfolios/${portfolio.id}/pdf-replacements/${ticket.assetId}/complete`,
        { method: "POST" },
      )
      setMessage("새 PDF를 처리하고 있어요. 기존 게시물은 그대로 유지돼요.")
      await onRefresh()
    } catch (error) {
      if (ticketCreated) {
        await request(`/v1/me/portfolios/${portfolio.id}/pdf-replacements`, {
          method: "DELETE",
        }).catch(() => undefined)
      }
      setMessage(errorMessage(error, "PDF를 교체하지 못했어요."))
    } finally {
      setIsMediaUpdating(false)
    }
  }

  async function cancelPdfReplacement() {
    try {
      await request(`/v1/me/portfolios/${portfolio.id}/pdf-replacements`, { method: "DELETE" })
      setMessage("PDF 교체를 취소했어요.")
      await onRefresh()
    } catch (error) {
      setMessage(errorMessage(error, "PDF 교체를 취소하지 못했어요."))
    }
  }

  async function replaceVideo(file: File) {
    setIsMediaUpdating(true)
    setMessage(undefined)
    let ticketCreated = false
    try {
      const durationSeconds = await readVideoDuration(file)
      if (durationSeconds > 180) throw new Error("영상은 최대 3분까지 올릴 수 있어요.")
      const ticket = await request<AssetUploadTicket>(
        `/v1/me/portfolios/${portfolio.id}/video-replacements`,
        {
          method: "POST",
          body: JSON.stringify({
            byteSize: file.size,
            durationSeconds,
            mimeType: file.type,
          }),
        },
      )
      ticketCreated = true
      await uploadFile(ticket.url, file, ticket.headers, "새 영상")
      await request(
        `/v1/me/portfolios/${portfolio.id}/video-replacements/${ticket.assetId}/complete`,
        { method: "POST" },
      )
      setMessage("영상을 교체했어요.")
      await onRefresh()
    } catch (error) {
      if (ticketCreated) {
        await request(`/v1/me/portfolios/${portfolio.id}/video-replacements`, {
          method: "DELETE",
        }).catch(() => undefined)
      }
      setMessage(errorMessage(error, "영상을 교체하지 못했어요."))
    } finally {
      setIsMediaUpdating(false)
    }
  }

  async function cancelVideoReplacement() {
    try {
      await request(`/v1/me/portfolios/${portfolio.id}/video-replacements`, {
        method: "DELETE",
      })
      setMessage("영상 교체를 취소했어요.")
      await onRefresh()
    } catch (error) {
      setMessage(errorMessage(error, "영상 교체를 취소하지 못했어요."))
    }
  }

  async function removeVideo() {
    try {
      await request(`/v1/me/portfolios/${portfolio.id}/video`, { method: "DELETE" })
      setMessage("영상을 제거했어요.")
      await onRefresh()
    } catch (error) {
      setMessage(errorMessage(error, "영상을 제거하지 못했어요."))
    }
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    try {
      await request(`/v1/me/portfolios/${portfolio.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          roleSlugs: selectedRoles,
          tags: String(form.get("tags") ?? "").split(","),
          title: form.get("title"),
        }),
      })
      setIsEditing(false)
      await onRefresh()
    } catch (error) {
      setMessage(errorMessage(error, "프로젝트를 수정하지 못했어요."))
    }
  }

  return (
    <Card className="rounded-2xl p-5 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold">{portfolio.title}</h3>
        <Badge variant="secondary">{statusLabel}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {portfolio.tags.map((tag) => `#${tag}`).join(" ")}
      </p>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        {portfolio.status === "published" ? (
          <a
            href={`/portfolio?portfolio=${encodeURIComponent(portfolio.id)}`}
            className="font-semibold text-primary"
          >
            상세 보기
          </a>
        ) : null}
        <button
          type="button"
          className="font-semibold text-primary"
          onClick={() => setIsEditing(true)}
        >
          정보 수정
        </button>
        {portfolio.status === "failed" || portfolio.replacementStatus === "failed" ? (
          <button
            type="button"
            className="font-semibold text-primary"
            onClick={() => action("retry")}
          >
            다시 처리
          </button>
        ) : null}
        {portfolio.status === "archived" || portfolio.status === "ready" ? (
          <button
            type="button"
            className="font-semibold text-primary"
            onClick={() => action("publish")}
          >
            {portfolio.status === "archived" ? "다시 게시" : "게시"}
          </button>
        ) : portfolio.status === "published" ? (
          <button type="button" className="text-muted-foreground" onClick={() => action("archive")}>
            보관
          </button>
        ) : null}
      </div>
      {portfolio.status === "published" || portfolio.status === "archived" ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
          <FilePicker
            compact
            accept="application/pdf"
            actionLabel="PDF 교체"
            disabled={isMediaUpdating || portfolio.replacementStatus !== null}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void replacePdf(file)
              event.currentTarget.value = ""
            }}
          />
          <FilePicker
            compact
            accept="video/mp4,video/webm,video/quicktime"
            actionLabel={portfolio.hasVideo ? "영상 교체" : "영상 추가"}
            disabled={isMediaUpdating || portfolio.hasPendingVideoReplacement}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void replaceVideo(file)
              event.currentTarget.value = ""
            }}
          />
          {portfolio.hasVideo ? (
            <button type="button" className="text-muted-foreground" onClick={removeVideo}>
              영상 제거
            </button>
          ) : null}
          {portfolio.replacementStatus && portfolio.replacementStatus !== "processing" ? (
            <button type="button" className="text-muted-foreground" onClick={cancelPdfReplacement}>
              교체 취소
            </button>
          ) : null}
          {portfolio.hasPendingVideoReplacement ? (
            <button
              type="button"
              className="text-muted-foreground"
              onClick={cancelVideoReplacement}
            >
              영상 교체 취소
            </button>
          ) : null}
        </div>
      ) : null}
      {portfolio.replacementStatus ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {portfolio.replacementStatus === "uploading"
            ? "새 PDF 업로드 대기 중"
            : portfolio.replacementStatus === "processing"
              ? "새 PDF 처리 중 · 기존 게시물은 계속 공개돼요."
              : `새 PDF 처리 실패${portfolio.replacementErrorCode ? ` · ${portfolio.replacementErrorCode}` : ""}`}
        </p>
      ) : null}
      {portfolio.videoErrorCode ? (
        <p className="mt-3 text-xs text-destructive">
          영상 처리에 실패했어요. PDF 포트폴리오는 그대로 게시할 수 있어요.
        </p>
      ) : null}
      {isEditing ? (
        <form className="mt-5 grid gap-3 border-t pt-5" onSubmit={save}>
          <Field label="제목">
            <input
              className={inputClass}
              name="title"
              defaultValue={portfolio.title}
              maxLength={60}
              placeholder="프로젝트 제목을 입력해주세요."
              required
            />
          </Field>
          <fieldset>
            <legend className="text-sm font-semibold">역할 1~3개</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {roles.map((role) => (
                <button
                  key={role.slug}
                  type="button"
                  aria-pressed={selectedRoles.includes(role.slug)}
                  onClick={() =>
                    setSelectedRoles((current) =>
                      current.includes(role.slug)
                        ? current.filter((value) => value !== role.slug)
                        : current.length < 3
                          ? [...current, role.slug]
                          : current,
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-2 text-xs",
                    selectedRoles.includes(role.slug) &&
                      "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {role.name}
                </button>
              ))}
            </div>
          </fieldset>
          <Field label="태그 (쉼표로 구분)">
            <input
              className={inputClass}
              name="tags"
              defaultValue={portfolio.tags.join(", ")}
              placeholder="예: 핀테크, 모바일"
              required
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={selectedRoles.length === 0}>
              저장
            </Button>
            <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : null}
      {message ? (
        <p className="mt-3 text-xs text-destructive" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </Card>
  )
}
