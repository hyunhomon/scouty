import type {
  AssetUploadTicket,
  ChatMessage,
  ChatMessagePage,
  ChatRoomSummary,
  NotificationSummary,
  PortfolioSummary,
  PortfolioUploadTicket,
  ProfileSummary,
  PublicProfile,
  ScoutCandidate,
  ScoutRequestSummary,
  SessionUser,
  UnreadCounts,
} from "@scouty/api"
import {
  Bell,
  Bookmark,
  Check,
  ChevronRight,
  FileUp,
  LoaderCircle,
  MessageCircle,
  Send,
  UserRound,
} from "lucide-react"
import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { trackProductEvent } from "@/lib/analytics"
import { apiUrl } from "@/lib/api"
import { cn } from "@/lib/utils"

type WorkspaceView = "chat" | "notifications" | "onboarding" | "profile" | "requests" | "scout"
type Role = { groupName: string; groupSlug: string; name: string; slug: string }

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  const response = await fetch(`${apiUrl}${path}`, { ...init, credentials: "include", headers })
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null
    throw new RequestError(response.status, error?.message ?? "요청을 처리하지 못했어요.")
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function LoadingPanel({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="animate-spin" aria-hidden="true" size={18} /> {label}
    </div>
  )
}

function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <Card className="rounded-2xl p-8 text-center shadow-none" aria-live="polite">
      <p className="font-bold">{message}</p>
      {retry ? (
        <Button type="button" variant="outline" className="mt-4" onClick={retry}>
          다시 시도
        </Button>
      ) : null}
    </Card>
  )
}

function SignInPanel() {
  const returnTo = `${window.location.pathname}${window.location.search}`
  return (
    <Card className="mx-auto max-w-md rounded-3xl p-8 text-center shadow-none">
      <img
        src="/brand/scouty.png"
        alt=""
        width="64"
        height="64"
        className="mx-auto size-16 rounded-2xl"
      />
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">계속하려면 로그인해주세요</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        공개 프로젝트는 누구나 볼 수 있고, 저장·제안·채팅은 로그인 후 사용할 수 있어요.
      </p>
      <Button asChild className="mt-6 w-full">
        <a href={`${apiUrl}/v1/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}>
          Google로 계속하기
        </a>
      </Button>
    </Card>
  )
}

const navItems: Array<{
  href: string
  icon: typeof UserRound
  label: string
  view: WorkspaceView
}> = [
  { href: "/me", icon: UserRound, label: "프로필", view: "profile" },
  { href: "/scout", icon: Send, label: "스카우트", view: "scout" },
  { href: "/requests", icon: Bookmark, label: "제안", view: "requests" },
  { href: "/chat", icon: MessageCircle, label: "채팅", view: "chat" },
  { href: "/notifications", icon: Bell, label: "알림", view: "notifications" },
]

function WorkspaceNav({
  isAuthenticated,
  unreadCounts,
  view,
}: {
  isAuthenticated: boolean
  unreadCounts: UnreadCounts
  view: WorkspaceView
}) {
  if (!isAuthenticated || view === "onboarding") return null
  return (
    <nav aria-label="주요 메뉴" className="mb-8 overflow-x-auto">
      <div className="flex min-w-max gap-1 rounded-2xl border bg-card p-1.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const unreadCount =
            item.view === "chat"
              ? unreadCounts.chat
              : item.view === "requests"
                ? unreadCounts.requests
                : 0
          return (
            <a
              key={item.view}
              href={item.href}
              aria-current={view === item.view ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
                view === item.view ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <Icon aria-hidden="true" size={17} /> {item.label}
              {unreadCount > 0 ? (
                <Badge
                  aria-label={`${item.label} 읽지 않음 ${unreadCount}개`}
                  className="min-w-5 justify-center px-1.5"
                  variant={view === item.view ? "secondary" : "default"}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              ) : null}
            </a>
          )
        })}
        <button
          type="button"
          className="h-11 rounded-xl px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
          onClick={async () => {
            await request("/v1/auth/logout", { method: "POST" })
            window.location.assign("/feed")
          }}
        >
          로그아웃
        </button>
      </div>
    </nav>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <fieldset className="grid gap-2 text-sm font-semibold">
      <legend className="mb-2">{label}</legend>
      {children}
    </fieldset>
  )
}

const inputClass =
  "h-11 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
const textareaClass =
  "min-h-24 resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"

async function readVideoDuration(file: File) {
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video")
      video.preload = "metadata"
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          reject(new Error("영상 길이를 확인하지 못했어요."))
          return
        }
        resolve(Math.ceil(video.duration))
      }
      video.onerror = () => reject(new Error("영상 파일을 읽지 못했어요."))
      video.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function OnboardingView({
  initialProfile,
  roles,
}: {
  initialProfile: ProfileSummary | null
  roles: Role[]
}) {
  const [avatarAssetId, setAvatarAssetId] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string>()
  const [selectedRoles, setSelectedRoles] = useState(
    () => initialProfile?.roles.map((role) => role.slug) ?? [],
  )

  async function uploadAvatar(file: File) {
    const ticket = await request<{
      assetId: string
      headers: Record<string, string>
      url: string
    }>("/v1/me/avatar/uploads", {
      method: "POST",
      body: JSON.stringify({ byteSize: file.size, mimeType: file.type }),
    })
    const response = await fetch(ticket.url, { method: "PUT", body: file, headers: ticket.headers })
    if (!response.ok) throw new Error("프로필 이미지 업로드에 실패했어요.")
    await request(`/v1/me/avatar/uploads/${ticket.assetId}/complete`, { method: "POST" })
    setAvatarAssetId(ticket.assetId)
    return ticket.assetId
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(undefined)
    const form = new FormData(event.currentTarget)
    try {
      const avatar = form.get("avatar")
      let nextAvatarId = avatarAssetId
      if (avatar instanceof File && avatar.size > 0) nextAvatarId = await uploadAvatar(avatar)
      await request("/v1/me/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...(nextAvatarId ? { avatarAssetId: nextAvatarId } : {}),
          bio: form.get("bio"),
          communicationPreference: form.get("communicationPreference") || null,
          handle: form.get("handle"),
          nickname: form.get("nickname"),
          roleSlugs: selectedRoles,
          scoutStatus: form.get("scoutStatus"),
        }),
      })
      window.location.assign("/me")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "프로필을 저장하지 못했어요.")
    } finally {
      setIsSaving(false)
    }
  }

  function toggleRole(slug: string) {
    setSelectedRoles((current) =>
      current.includes(slug)
        ? current.filter((role) => role !== slug)
        : current.length < 3
          ? [...current, slug]
          : current,
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-bold text-primary">Scouty 시작하기</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">
        함께 만들 사람에게 나를 알려주세요
      </h1>
      <p className="mt-3 text-muted-foreground">필수 정보만 받고, 학교나 경력은 묻지 않아요.</p>
      <form className="mt-8 grid gap-5" onSubmit={submit}>
        <Field label="프로필 이미지">
          <input
            name="avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required={!initialProfile?.avatarUrl}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="닉네임">
            <input
              className={inputClass}
              name="nickname"
              minLength={2}
              maxLength={20}
              defaultValue={initialProfile?.nickname}
              required
            />
          </Field>
          <Field label="핸들">
            <input
              className={inputClass}
              name="handle"
              pattern="[a-z0-9_]{3,20}"
              defaultValue={initialProfile?.handle}
              required
            />
          </Field>
        </div>
        <Field label="소개">
          <textarea
            className={textareaClass}
            name="bio"
            minLength={1}
            maxLength={160}
            defaultValue={initialProfile?.bio}
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
                onClick={() => toggleRole(role.slug)}
                className={cn(
                  "h-10 rounded-full border px-4 text-sm font-semibold",
                  selectedRoles.includes(role.slug)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card",
                )}
              >
                {role.name}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="편한 소통 방식 (선택)">
          <input
            className={inputClass}
            name="communicationPreference"
            maxLength={60}
            defaultValue={initialProfile?.communicationPreference ?? ""}
          />
        </Field>
        <Field label="스카우트 상태">
          <select
            className={inputClass}
            name="scoutStatus"
            defaultValue={initialProfile?.scoutStatus ?? "selective"}
          >
            <option value="open">적극적으로 받고 있어요</option>
            <option value="selective">좋은 제안이면 확인해요</option>
            <option value="closed">지금은 받지 않아요</option>
          </select>
        </Field>
        {message ? (
          <p className="text-sm text-destructive" role="status" aria-live="polite">
            {message}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={isSaving || selectedRoles.length === 0}>
          {isSaving ? "저장하는 중" : "프로필 저장"}
        </Button>
      </form>
    </div>
  )
}

function PortfolioUploader({ roles, onCreated }: { roles: Role[]; onCreated: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const pdf = form.get("pdf")
    const video = form.get("video")
    if (!(pdf instanceof File) || pdf.size === 0) return
    setIsSubmitting(true)
    setError(undefined)
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
      for (const upload of ticket.uploads) {
        const file = upload.kind === "pdf" ? pdf : video
        if (!(file instanceof File)) continue
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: upload.headers,
          body: file,
        })
        if (!response.ok)
          throw new Error(`${upload.kind === "pdf" ? "PDF" : "영상"} 업로드에 실패했어요.`)
      }
      await request(`/v1/me/portfolios/${ticket.portfolioId}/uploads/complete`, { method: "POST" })
      event.currentTarget.reset()
      setSelectedRoles([])
      onCreated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "프로젝트를 등록하지 못했어요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="rounded-2xl p-5 shadow-none">
      <h2 className="text-lg font-extrabold">새 프로젝트 추가</h2>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <Field label="제목">
          <input className={inputClass} name="title" maxLength={60} required />
        </Field>
        <Field label="PDF">
          <input name="pdf" type="file" accept="application/pdf" required />
        </Field>
        <Field label="영상 (선택)">
          <input name="video" type="file" accept="video/mp4,video/webm,video/quicktime" />
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

function PortfolioCard({
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
      setMessage(error instanceof Error ? error.message : "프로젝트 상태를 바꾸지 못했어요.")
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
      const upload = await fetch(ticket.url, {
        method: "PUT",
        headers: ticket.headers,
        body: file,
      })
      if (!upload.ok) throw new Error("새 PDF를 올리지 못했어요.")
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
      setMessage(error instanceof Error ? error.message : "PDF를 교체하지 못했어요.")
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
      setMessage(error instanceof Error ? error.message : "PDF 교체를 취소하지 못했어요.")
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
      const upload = await fetch(ticket.url, {
        method: "PUT",
        headers: ticket.headers,
        body: file,
      })
      if (!upload.ok) throw new Error("새 영상을 올리지 못했어요.")
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
      setMessage(error instanceof Error ? error.message : "영상을 교체하지 못했어요.")
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
      setMessage(error instanceof Error ? error.message : "영상 교체를 취소하지 못했어요.")
    }
  }

  async function removeVideo() {
    try {
      await request(`/v1/me/portfolios/${portfolio.id}/video`, { method: "DELETE" })
      setMessage("영상을 제거했어요.")
      await onRefresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "영상을 제거하지 못했어요.")
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
      setMessage(error instanceof Error ? error.message : "프로젝트를 수정하지 못했어요.")
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
          <label className="cursor-pointer font-semibold text-primary">
            PDF 교체
            <input
              className="sr-only"
              type="file"
              accept="application/pdf"
              disabled={isMediaUpdating || portfolio.replacementStatus !== null}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void replacePdf(file)
                event.currentTarget.value = ""
              }}
            />
          </label>
          <label className="cursor-pointer font-semibold text-primary">
            {portfolio.hasVideo ? "영상 교체" : "영상 추가"}
            <input
              className="sr-only"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              disabled={isMediaUpdating || portfolio.hasPendingVideoReplacement}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) void replaceVideo(file)
                event.currentTarget.value = ""
              }}
            />
          </label>
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

function ProfileView({ profile, roles }: { profile: ProfileSummary; roles: Role[] }) {
  const [portfolios, setPortfolios] = useState<PortfolioSummary[]>([])
  const [bookmarks, setBookmarks] = useState<PortfolioSummary[]>([])
  const [deleteConfirmation, setDeleteConfirmation] = useState("")
  const [deleteError, setDeleteError] = useState<string>()
  const load = useCallback(async () => {
    const [projects, saved] = await Promise.all([
      request<PortfolioSummary[]>("/v1/me/portfolios"),
      request<PortfolioSummary[]>("/v1/me/bookmarks"),
    ])
    setPortfolios(projects)
    setBookmarks(saved)
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        <div className="flex items-start gap-4">
          {profile.avatarUrl ? (
            <img
              src={`${apiUrl}${profile.avatarUrl}`}
              alt=""
              className="size-16 rounded-full object-cover"
            />
          ) : null}
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{profile.nickname}</h1>
            <p className="text-muted-foreground">@{profile.handle}</p>
            <p className="mt-3 leading-7">{profile.bio}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {profile.roles.map((role) => (
            <Badge key={role.slug}>{role.name}</Badge>
          ))}
        </div>
        <TrustStats stats={profile.stats} />
        <div className="mt-10 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">내 프로젝트</h2>
          <a href="/onboarding" className="text-sm font-semibold text-primary">
            프로필 수정
          </a>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {portfolios.map((portfolio) => (
            <PortfolioCard
              key={portfolio.id}
              portfolio={portfolio}
              roles={roles}
              onRefresh={load}
            />
          ))}
          {portfolios.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 등록한 프로젝트가 없어요.</p>
          ) : null}
        </div>
        <h2 className="mt-10 text-xl font-extrabold">저장한 프로젝트</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {bookmarks.map((portfolio) => (
            <a
              key={portfolio.id}
              href={`/portfolio?portfolio=${encodeURIComponent(portfolio.id)}`}
              className="rounded-2xl border bg-card p-5 font-bold"
            >
              {portfolio.title}
            </a>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-6">
        <PortfolioUploader roles={roles} onCreated={load} />
        <Card className="rounded-2xl p-5 shadow-none">
          <h2 className="font-extrabold">계정 설정</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            계정을 삭제하면 공개 프로필과 프로젝트가 즉시 숨겨지고, 작성한 개인 콘텐츠는 익명화돼요.
            이 작업은 되돌릴 수 없어요.
          </p>
          <label className="mt-4 grid gap-2 text-sm font-semibold">
            삭제하려면 ‘탈퇴’를 입력해주세요.
            <input
              className={inputClass}
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="mt-3 text-destructive"
            disabled={deleteConfirmation !== "탈퇴"}
            onClick={async () => {
              setDeleteError(undefined)
              try {
                await request("/v1/me/account", { method: "DELETE" })
                window.location.assign("/feed")
              } catch (error) {
                setDeleteError(error instanceof Error ? error.message : "계정을 삭제하지 못했어요.")
              }
            }}
          >
            계정 삭제
          </Button>
          {deleteError ? <p className="mt-3 text-xs text-destructive">{deleteError}</p> : null}
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-2xl p-4 shadow-none">
      <strong className="text-xl">{value}</strong>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Card>
  )
}

function responseTime(seconds: string | null) {
  if (!seconds) return "표본 부족"
  const value = Number(seconds)
  if (value < 60) return `${value}초`
  if (value < 3600) return `${Math.round(value / 60)}분`
  if (value < 86_400) return `${(value / 3600).toFixed(1)}시간`
  return `${(value / 86_400).toFixed(1)}일`
}

function TrustStats({ stats }: { stats: ProfileSummary["stats"] }) {
  const responseRate =
    stats.responseEligibleCount >= 5
      ? `${Math.round((stats.responseCount / stats.responseEligibleCount) * 100)}%`
      : "표본 부족"
  return (
    <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Stat
        label="매너 온도"
        value={
          stats.mannerEvaluationCount === 0
            ? `${stats.mannerTemperature.toFixed(1)}° · 첫 평가 전`
            : `${stats.mannerTemperature.toFixed(1)}°`
        }
      />
      <Stat
        label="평균 응답 시간"
        value={stats.responseCount >= 3 ? responseTime(stats.averageResponseSeconds) : "표본 부족"}
      />
      <Stat label="제안 응답률" value={responseRate} />
      <Stat label="보낸 스카우트" value={String(stats.scoutSentCount)} />
      <Stat label="받은 스카우트" value={String(stats.scoutReceivedCount)} />
    </div>
  )
}

function ScoutView({ roles }: { roles: Role[] }) {
  const [role, setRole] = useState(roles[0]?.slug ?? "")
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([])
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [showProposal, setShowProposal] = useState(false)
  const [message, setMessage] = useState<string>()
  const touchStartY = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!role && roles[0]) setRole(roles[0].slug)
  }, [role, roles])

  useEffect(() => {
    if (!role) return
    setMessage(undefined)
    Promise.all([
      request<ScoutCandidate[]>(`/v1/scout/candidates?role=${encodeURIComponent(role)}`),
      request<PortfolioSummary[]>("/v1/me/bookmarks"),
    ])
      .then(([items, saved]) => {
        let seen = new Set<string>()
        try {
          seen = new Set(JSON.parse(sessionStorage.getItem("scouty-seen-portfolios") ?? "[]"))
        } catch {
          seen = new Set()
        }
        const ordered = [
          ...items.filter((item) => !seen.has(item.id)),
          ...items.filter((item) => seen.has(item.id)),
        ]
        setCandidates(ordered)
        setBookmarks(new Set(saved.map((item) => item.id)))
        const requestedPortfolio = new URLSearchParams(window.location.search).get("portfolio")
        const requestedIndex = requestedPortfolio
          ? ordered.findIndex((item) => item.id === requestedPortfolio)
          : -1
        setIndex(requestedIndex >= 0 ? requestedIndex : 0)
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "프로젝트를 불러오지 못했어요."),
      )
  }, [role])

  const candidate = candidates[index]

  function nextCandidate() {
    if (!candidate) return
    let seen: string[] = []
    try {
      seen = JSON.parse(sessionStorage.getItem("scouty-seen-portfolios") ?? "[]")
    } catch {
      seen = []
    }
    sessionStorage.setItem(
      "scouty-seen-portfolios",
      JSON.stringify([...new Set([...seen, candidate.id])]),
    )
    setShowProposal(false)
    setIndex((current) => Math.min(current + 1, candidates.length - 1))
  }

  async function toggleBookmark() {
    if (!candidate) return
    const isBookmarked = bookmarks.has(candidate.id)
    await request(`/v1/me/bookmarks/${candidate.id}`, {
      method: isBookmarked ? "DELETE" : "PUT",
    })
    setBookmarks((current) => {
      const next = new Set(current)
      if (isBookmarked) next.delete(candidate.id)
      else next.add(candidate.id)
      return next
    })
  }

  async function sendProposal(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!candidate) return
    const form = new FormData(event.currentTarget)
    try {
      await request("/v1/scout/requests", {
        method: "POST",
        body: JSON.stringify({
          estimatedPeriodText: form.get("estimatedPeriodText"),
          message: form.get("message"),
          projectSummary: form.get("projectSummary"),
          projectTitle: form.get("projectTitle"),
          requestedRoleSlug: form.get("requestedRoleSlug"),
          sourcePortfolioId: candidate.id,
          teamCompositionText: form.get("teamCompositionText"),
          weeklyCommitmentText: form.get("weeklyCommitmentText"),
        }),
      })
      setMessage("제안을 보냈어요.")
      setShowProposal(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "제안을 보내지 못했어요.")
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">한 장씩 깊게</p>
          <h1 className="mt-2 text-3xl font-extrabold">스카우트</h1>
        </div>
        <select
          aria-label="탐색할 역할"
          className={inputClass}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          {roles.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {candidate ? (
        <Card
          className="mt-6 overflow-hidden rounded-3xl shadow-none"
          onTouchStart={(event) => {
            touchStartY.current = event.touches[0]?.clientY
          }}
          onTouchEnd={(event) => {
            const endY = event.changedTouches[0]?.clientY
            if (
              touchStartY.current !== undefined &&
              endY !== undefined &&
              Math.abs(endY - touchStartY.current) > 60
            ) {
              nextCandidate()
            }
            touchStartY.current = undefined
          }}
        >
          <div className="aspect-[4/3] bg-muted">
            {candidate.coverUrl ? (
              <img
                src={candidate.coverUrl}
                alt={`${candidate.title} 커버`}
                className="size-full object-contain"
              />
            ) : null}
          </div>
          <div className="p-6">
            <p className="text-sm text-muted-foreground">
              {candidate.author.nickname} · @{candidate.author.handle}
            </p>
            <h2 className="mt-2 text-2xl font-extrabold">{candidate.title}</h2>
            <div className="mt-4 flex gap-2">
              {candidate.roles.map((item) => (
                <Badge key={item.slug}>{item.name}</Badge>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button variant="outline" onClick={nextCandidate}>
                다음
              </Button>
              <Button variant="outline" onClick={toggleBookmark}>
                <Bookmark
                  aria-hidden="true"
                  fill={bookmarks.has(candidate.id) ? "currentColor" : "none"}
                />
                {bookmarks.has(candidate.id) ? "저장됨" : "저장"}
              </Button>
              <Button asChild variant="outline">
                <a href={`/portfolio?portfolio=${encodeURIComponent(candidate.id)}`}>상세</a>
              </Button>
              <Button onClick={() => setShowProposal(true)}>제안</Button>
            </div>
          </div>
        </Card>
      ) : (
        <ErrorPanel message="조건에 맞는 프로젝트가 아직 없어요." />
      )}
      {showProposal && candidate ? (
        <Card className="mt-5 rounded-2xl p-5 shadow-none">
          <h2 className="font-extrabold">{candidate.author.nickname}님에게 제안</h2>
          <form className="mt-4 grid gap-3" onSubmit={sendProposal}>
            <Field label="필요한 역할">
              <select className={inputClass} name="requestedRoleSlug">
                {candidate.author.roles.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="제안 프로젝트명">
              <input className={inputClass} name="projectTitle" maxLength={80} required />
            </Field>
            <Field label="한 줄 소개">
              <input className={inputClass} name="projectSummary" maxLength={160} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="예상 기간">
                <input className={inputClass} name="estimatedPeriodText" maxLength={60} required />
              </Field>
              <Field label="주당 활동량">
                <input className={inputClass} name="weeklyCommitmentText" maxLength={60} required />
              </Field>
            </div>
            <Field label="현재 팀 구성">
              <input className={inputClass} name="teamCompositionText" maxLength={120} required />
            </Field>
            <Field label="메시지">
              <textarea className={textareaClass} name="message" maxLength={500} required />
            </Field>
            <Button type="submit">제안 보내기</Button>
          </form>
        </Card>
      ) : null}
      {message ? (
        <p
          className="mt-4 text-center text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}

function RequestsView({ onRead }: { onRead: () => Promise<void> }) {
  const [direction, setDirection] = useState<"received" | "sent">("received")
  const [items, setItems] = useState<ScoutRequestSummary[]>([])
  const load = useCallback(
    () =>
      request<ScoutRequestSummary[]>(`/v1/scout/requests?direction=${direction}`).then(
        async (next) => {
          setItems(next)
          await onRead()
        },
      ),
    [direction, onRead],
  )
  useEffect(() => {
    void load()
  }, [load])
  async function transition(id: string, action: "accept" | "cancel" | "decline") {
    const result = await request<{ chatRoomId: string | null }>(
      `/v1/scout/requests/${id}/${action}`,
      { method: "POST" },
    )
    if (result.chatRoomId)
      window.location.assign(`/chat?room=${encodeURIComponent(result.chatRoomId)}`)
    else await load()
  }
  return (
    <div>
      <h1 className="text-3xl font-extrabold">스카우트 제안</h1>
      <div className="mt-5 flex gap-2">
        <Button
          variant={direction === "received" ? "default" : "outline"}
          onClick={() => setDirection("received")}
        >
          받은 제안
        </Button>
        <Button
          variant={direction === "sent" ? "default" : "outline"}
          onClick={() => setDirection("sent")}
        >
          보낸 제안
        </Button>
      </div>
      <div className="mt-5 grid gap-3">
        {items.map((item) => (
          <Card key={item.id} className="rounded-2xl p-5 shadow-none">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">
                  {item.user.nickname} · {item.requestedRole.name}
                </p>
                <h2 className="mt-1 font-extrabold">{item.projectTitle}</h2>
              </div>
              <div className="flex items-center gap-2">
                {item.isUnread ? <Badge>새 제안</Badge> : null}
                <Badge variant="secondary">{item.status}</Badge>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6">{item.projectSummary}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              “{item.sourcePortfolio.title}” 프로젝트를 보고 제안했어요.
            </p>
            {item.status === "pending" ? (
              <div className="mt-4 flex gap-2">
                {direction === "received" ? (
                  <>
                    <Button onClick={() => transition(item.id, "accept")}>수락</Button>
                    <Button variant="outline" onClick={() => transition(item.id, "decline")}>
                      거절
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => transition(item.id, "cancel")}>
                    취소
                  </Button>
                )}
              </div>
            ) : null}
          </Card>
        ))}
        {items.length === 0 ? <ErrorPanel message="아직 제안이 없어요." /> : null}
      </div>
    </div>
  )
}

function MessageBody({ body }: { body: string }) {
  const content: React.ReactNode[] = []
  let cursor = 0
  for (const match of body.matchAll(/https?:\/\/[^\s]+/g)) {
    const offset = match.index
    if (offset > cursor)
      content.push(<span key={`text-${cursor}`}>{body.slice(cursor, offset)}</span>)
    content.push(
      <a
        key={`link-${offset}`}
        href={match[0]}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2"
      >
        {match[0]}
      </a>,
    )
    cursor = offset + match[0].length
  }
  if (cursor < body.length) content.push(<span key={`text-${cursor}`}>{body.slice(cursor)}</span>)
  return content
}

function ChatView({ onUnreadChange }: { onUnreadChange: (count: number) => void }) {
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([])
  const [roomId, setRoomId] = useState(
    () =>
      window.location.pathname.match(/^\/chat\/([^/]+)/)?.[1] ??
      new URLSearchParams(window.location.search).get("room") ??
      undefined,
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState<string>()
  const cursorRef = useRef<string | null>(null)
  const loadRooms = useCallback(
    () =>
      request<ChatRoomSummary[]>("/v1/chat/rooms").then((next) => {
        setRooms(next)
        setRoomId((current) => current ?? next[0]?.id)
        onUnreadChange(next.reduce((total, room) => total + room.unreadCount, 0))
      }),
    [onUnreadChange],
  )
  useEffect(() => {
    void loadRooms()
  }, [loadRooms])
  useEffect(() => {
    if (!roomId) return
    let retryAttempt = 0
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let socket: WebSocket | undefined
    let stopped = false
    let recoverAgain = false
    let recovery: Promise<void> | null = null
    cursorRef.current = null
    setMessages([])

    const recoverMessages = (reset = false): Promise<void> => {
      if (recovery) {
        recoverAgain = true
        return recovery
      }
      recovery = (async () => {
        let after = reset ? null : cursorRef.current
        do {
          const query = after ? `?after=${encodeURIComponent(after)}` : ""
          const page = await request<ChatMessagePage>(`/v1/chat/rooms/${roomId}/messages${query}`)
          setMessages((current) => {
            const existingIds = new Set((reset ? [] : current).map((item) => item.id))
            return [
              ...(reset ? [] : current),
              ...page.items.filter((item) => !existingIds.has(item.id)),
            ]
          })
          reset = false
          cursorRef.current = page.cursor
          after = page.cursor
          if (!page.hasMore) break
        } while (!stopped)
        await loadRooms()
      })()
        .catch((error) => {
          if (!stopped) {
            setMessage(error instanceof Error ? error.message : "채팅을 동기화하지 못했어요.")
          }
        })
        .finally(() => {
          recovery = null
          if (recoverAgain && !stopped) {
            recoverAgain = false
            void recoverMessages()
          }
        })
      return recovery
    }

    const connect = () => {
      if (stopped) return
      const socketUrl = new URL(`${apiUrl}/v1/chat/rooms/${roomId}/socket`)
      socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:"
      socket = new WebSocket(socketUrl)
      socket.addEventListener("open", () => {
        retryAttempt = 0
        void recoverMessages()
      })
      socket.addEventListener("message", () => void recoverMessages())
      socket.addEventListener("close", () => {
        if (stopped) return
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retryAttempt++, 10_000))
      })
    }

    void recoverMessages(true).finally(connect)
    return () => {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      socket?.close()
    }
  }, [loadRooms, roomId])
  async function send(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!roomId) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const body = String(form.get("body") ?? "").trim()
    const images = form
      .getAll("images")
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, 4)
    if (!body && images.length === 0) return
    if (form.getAll("images").length > 4) {
      setMessage("이미지는 한 번에 최대 4장까지 보낼 수 있어요.")
      return
    }
    setMessage(undefined)
    try {
      const created: ChatMessage[] = []
      if (body) {
        created.push(
          await request<ChatMessage>(`/v1/chat/rooms/${roomId}/messages`, {
            method: "POST",
            body: JSON.stringify({ body, clientMessageId: crypto.randomUUID() }),
          }),
        )
      }
      for (const image of images) {
        const ticket = await request<{
          assetId: string
          headers: Record<string, string>
          url: string
        }>(`/v1/chat/rooms/${roomId}/image-uploads`, {
          method: "POST",
          body: JSON.stringify({ byteSize: image.size, mimeType: image.type }),
        })
        const upload = await fetch(ticket.url, {
          method: "PUT",
          headers: ticket.headers,
          body: image,
        })
        if (!upload.ok) throw new Error("채팅 이미지를 올리지 못했어요.")
        created.push(
          await request<ChatMessage>(`/v1/chat/rooms/${roomId}/images`, {
            method: "POST",
            body: JSON.stringify({ assetId: ticket.assetId, clientMessageId: crypto.randomUUID() }),
          }),
        )
      }
      setMessages((current) => {
        const ids = new Set(current.map((item) => item.id))
        return [...current, ...created.filter((item) => !ids.has(item.id))]
      })
      formElement.reset()
      await loadRooms()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "메시지를 보내지 못했어요.")
    }
  }
  const activeRoom = rooms.find((room) => room.id === roomId)
  async function manner(sentiment: "positive" | "negative") {
    if (!activeRoom) return
    try {
      await request(`/v1/scout/requests/${activeRoom.scoutContext.requestId}/manner`, {
        method: "POST",
        body: JSON.stringify({ sentiment }),
      })
      setMessage("매너 평가를 남겼어요.")
      await loadRooms()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "매너 평가를 남기지 못했어요.")
    }
  }
  return (
    <div className="grid min-h-[36rem] gap-4 lg:grid-cols-[18rem_1fr]">
      <aside className="rounded-2xl border bg-card p-2">
        <h1 className="px-3 py-3 text-xl font-extrabold">채팅</h1>
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => setRoomId(room.id)}
            className={cn("w-full rounded-xl p-3 text-left", room.id === roomId && "bg-muted")}
          >
            <span className="flex items-center justify-between gap-2">
              <strong>{room.user.nickname}</strong>
              {room.unreadCount > 0 ? <Badge>{room.unreadCount}</Badge> : null}
            </span>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {room.lastMessage?.body ?? room.scoutContext.portfolioTitle}
            </p>
          </button>
        ))}
      </aside>
      <Card className="flex min-h-[36rem] flex-col rounded-2xl shadow-none">
        {activeRoom ? (
          <>
            <header className="border-b p-4">
              <strong>{activeRoom.user.nickname}</strong>
              <p className="text-xs text-muted-foreground">
                “{activeRoom.scoutContext.portfolioTitle}” · {activeRoom.scoutContext.roleName}
              </p>
              {activeRoom.user.isDeleted ? (
                <p className="mt-2 text-xs text-muted-foreground">삭제된 계정과의 대화예요.</p>
              ) : (
                <TrustActions
                  userId={activeRoom.user.userId}
                  onBlocked={() =>
                    setRooms((current) =>
                      current.map((room) =>
                        room.id === activeRoom.id ? { ...room, isReadOnly: true } : room,
                      ),
                    )
                  }
                />
              )}
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2 text-sm",
                    message.type === "system"
                      ? "mx-auto bg-muted text-center text-xs"
                      : message.isMine
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted",
                  )}
                >
                  <span className="sr-only">
                    {message.type === "system"
                      ? "시스템 안내"
                      : message.isMine
                        ? "내 메시지"
                        : `${activeRoom.user.nickname} 메시지`}
                    .
                  </span>
                  {message.assetUrl ? (
                    <img
                      src={message.assetUrl}
                      alt="채팅 이미지"
                      className="max-h-80 rounded-xl object-contain"
                    />
                  ) : message.body ? (
                    <MessageBody body={message.body} />
                  ) : null}
                  <time className="mt-1 block text-[11px]" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
              ))}
            </div>
            {activeRoom.isReadOnly ? (
              <p className="border-t p-4 text-center text-sm text-muted-foreground">
                {activeRoom.user.isDeleted
                  ? "삭제된 계정과의 이전 대화만 볼 수 있어요."
                  : "차단된 관계라 이전 대화만 볼 수 있어요."}
              </p>
            ) : (
              <form className="grid gap-2 border-t p-3" onSubmit={send}>
                <div className="flex gap-2">
                  <label className="sr-only" htmlFor="chat-message">
                    메시지
                  </label>
                  <input
                    id="chat-message"
                    name="body"
                    className={cn(inputClass, "flex-1")}
                    maxLength={2000}
                  />
                  <Button type="submit" aria-label="메시지 보내기">
                    <Send aria-hidden="true" />
                  </Button>
                </div>
                <label className="text-xs text-muted-foreground">
                  이미지 최대 4장
                  <input
                    className="ml-2"
                    name="images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                  />
                </label>
              </form>
            )}
            {activeRoom.canReview ? (
              <div className="flex items-center justify-center gap-2 border-t p-3 text-xs text-muted-foreground">
                <span>이번 소통은 어땠나요?</span>
                <button className="min-h-11 px-2" type="button" onClick={() => manner("positive")}>
                  좋았어요
                </button>
                <button className="min-h-11 px-2" type="button" onClick={() => manner("negative")}>
                  아쉬웠어요
                </button>
              </div>
            ) : null}
            {message ? (
              <p
                className="border-t p-3 text-center text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            ) : null}
          </>
        ) : (
          <LoadingPanel label="채팅방을 선택해주세요" />
        )}
      </Card>
    </div>
  )
}

function NotificationsView() {
  const [items, setItems] = useState<NotificationSummary[]>([])
  const load = useCallback(
    () => request<NotificationSummary[]>("/v1/me/notifications").then(setItems),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])
  async function read(id: string) {
    await request(`/v1/me/notifications/${id}/read`, { method: "POST" })
    await load()
  }
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-extrabold">알림</h1>
      <div className="mt-5 grid gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => read(item.id)}
            className={cn(
              "flex items-center justify-between rounded-2xl border bg-card p-4 text-left",
              !item.isRead && "border-primary/40",
            )}
          >
            <span className="text-sm font-semibold">
              {notificationCopy[item.type] ?? "새로운 소식이 있어요."}
            </span>
            {item.isRead ? (
              <Check aria-label="읽음" size={16} />
            ) : (
              <ChevronRight aria-label="읽기" size={16} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

const notificationCopy: Record<string, string> = {
  chat_message_received: "새 채팅 메시지가 도착했어요.",
  manner_feedback_available: "매너 평가를 남길 수 있어요.",
  portfolio_processing_completed: "프로젝트 처리가 완료됐어요.",
  portfolio_processing_failed: "프로젝트 처리에 실패했어요.",
  scout_request_accepted: "보낸 제안이 수락됐어요.",
  scout_request_declined: "보낸 제안에 답변이 도착했어요.",
  scout_request_received: "새 스카우트 제안이 도착했어요.",
}

function TrustActions({ userId, onBlocked }: { userId: string; onBlocked?: () => void }) {
  const [message, setMessage] = useState<string>()
  const [reasonCode, setReasonCode] = useState("spam")

  async function block() {
    try {
      await request(`/v1/me/blocks/${userId}`, { method: "PUT" })
      setMessage("이 사용자를 차단했어요.")
      onBlocked?.()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "차단하지 못했어요.")
    }
  }

  async function reportUser() {
    try {
      await request("/v1/reports", {
        method: "POST",
        body: JSON.stringify({ reasonCode, targetId: userId, targetType: "user" }),
      })
      setMessage("신고를 접수했어요.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "신고하지 못했어요.")
    }
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={block}>
        차단
      </Button>
      <select
        className={inputClass}
        value={reasonCode}
        onChange={(event) => setReasonCode(event.target.value)}
        aria-label="신고 사유"
      >
        <option value="identity_theft">도용·사칭</option>
        <option value="spam">스팸 제안</option>
        <option value="harassment">괴롭힘</option>
        <option value="personal_information_request">개인정보 요구</option>
        <option value="irrelevant_commercial">무관한 영리 홍보</option>
      </select>
      <Button type="button" variant="outline" onClick={reportUser}>
        신고
      </Button>
      {message ? (
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  )
}

export function ProductWorkspace({ view }: { view: WorkspaceView }) {
  const [session, setSession] = useState<SessionUser | null | undefined>()
  const [profile, setProfile] = useState<ProfileSummary | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({ chat: 0, requests: 0 })
  const [error, setError] = useState<string>()
  const refreshUnread = useCallback(async () => {
    const next = await request<UnreadCounts>("/v1/me/unread-counts")
    setUnreadCounts(next)
  }, [])
  const updateChatUnread = useCallback((chat: number) => {
    setUnreadCounts((current) => ({ ...current, chat }))
  }, [])
  const load = useCallback(async () => {
    setError(undefined)
    try {
      const currentSession = await request<SessionUser | null>("/v1/auth/session")
      if (!currentSession) {
        setSession(null)
        return
      }
      const [availableRoles, nextProfile, nextUnread] = await Promise.all([
        request<Role[]>("/v1/discovery/roles"),
        request<ProfileSummary | null>("/v1/me"),
        request<UnreadCounts>("/v1/me/unread-counts"),
      ])
      setRoles(availableRoles)
      setProfile(nextProfile)
      setUnreadCounts(nextUnread)
      setSession(currentSession)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "화면을 불러오지 못했어요.")
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    if (!session) return
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshUnread()
    }
    const interval = window.setInterval(refreshWhenVisible, 30_000)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refreshUnread, session])
  const content = useMemo(() => {
    if (session === undefined && !error) return <LoadingPanel />
    if (error) return <ErrorPanel message={error} retry={load} />
    if (!session) return <SignInPanel />
    if (view === "onboarding") return <OnboardingView initialProfile={profile} roles={roles} />
    if (!session.isProfileComplete || !profile)
      return <OnboardingView initialProfile={profile} roles={roles} />
    if (view === "profile") return <ProfileView profile={profile} roles={roles} />
    if (view === "scout") return <ScoutView roles={roles} />
    if (view === "requests") return <RequestsView onRead={refreshUnread} />
    if (view === "chat") return <ChatView onUnreadChange={updateChatUnread} />
    return <NotificationsView />
  }, [error, load, profile, refreshUnread, roles, session, updateChatUnread, view])
  return (
    <>
      <WorkspaceNav isAuthenticated={Boolean(session)} unreadCounts={unreadCounts} view={view} />
      {content}
    </>
  )
}

export function PublicProfileRoute() {
  const handle =
    window.location.pathname.match(/^\/profiles\/([^/]+)\/?$/)?.[1] ??
    new URLSearchParams(window.location.search).get("handle") ??
    undefined
  const [profile, setProfile] = useState<PublicProfile | null | undefined>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!handle) {
      setProfile(null)
      return
    }
    request<PublicProfile | null>(`/v1/profiles/${encodeURIComponent(handle)}`)
      .then((nextProfile) => {
        setProfile(nextProfile)
        if (nextProfile) trackProductEvent("profile_viewed")
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "프로필을 불러오지 못했어요."),
      )
  }, [handle])

  if (error) return <ErrorPanel message={error} />
  if (profile === undefined) return <LoadingPanel label="프로필 불러오는 중" />
  if (!profile) return <ErrorPanel message="프로필을 찾을 수 없어요." />

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-start gap-4">
        {profile.avatarUrl ? (
          <img
            src={`${apiUrl}${profile.avatarUrl}`}
            alt={`${profile.nickname} 프로필`}
            className="size-20 rounded-full object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight">{profile.nickname}</h1>
          <p className="text-muted-foreground">@{profile.handle}</p>
          <p className="mt-3 leading-7">{profile.bio}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.roles.map((role) => (
              <Badge key={role.slug}>{role.name}</Badge>
            ))}
          </div>
        </div>
      </div>
      <TrustStats stats={profile.stats} />
      {profile.communicationPreference ? (
        <p className="mt-5 text-sm text-muted-foreground">
          편한 소통 방식 · {profile.communicationPreference}
        </p>
      ) : null}
      <TrustActions userId={profile.userId} />
      <h2 className="mt-10 text-2xl font-extrabold">게시한 프로젝트</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profile.portfolios.map((portfolio) => (
          <a
            key={portfolio.id}
            href={`/portfolio?portfolio=${encodeURIComponent(portfolio.id)}`}
            className="rounded-2xl border bg-card p-5 outline-none transition hover:border-primary/30 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <strong>{portfolio.title}</strong>
            <p className="mt-3 text-sm text-muted-foreground">
              {portfolio.tags.map((tag) => `#${tag}`).join(" ")}
            </p>
          </a>
        ))}
      </div>
    </div>
  )
}
