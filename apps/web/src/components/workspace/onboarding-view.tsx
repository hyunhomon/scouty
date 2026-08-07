import type { ProfileSummary } from "@scouty/api"
import { type SubmitEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { FilePicker } from "@/components/ui/file-picker"
import { Field, inputClass, textareaClass } from "@/components/ui/form-controls"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { errorMessage, request, uploadFile } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { Role } from "./types"

export function OnboardingView({
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
    await uploadFile(ticket.url, file, ticket.headers, "프로필 이미지")
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
      setMessage(errorMessage(error, "프로필을 저장하지 못했어요."))
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
        <Field label="프로필 이미지 (선택)">
          <FilePicker
            name="avatar"
            accept="image/jpeg,image/png,image/webp"
            actionLabel="프로필 이미지 선택"
            helperText="JPG, PNG, WebP · 최대 5MB"
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
              placeholder="예: 스카우티"
              required
            />
          </Field>
          <Field label="핸들">
            <input
              className={inputClass}
              name="handle"
              pattern="[a-z0-9_]{3,20}"
              defaultValue={initialProfile?.handle}
              placeholder="예: scouty"
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
            placeholder="어떤 일을 좋아하고 무엇을 함께 만들고 싶은지 알려주세요."
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
            placeholder="예: 평일 저녁에 디스코드가 편해요."
          />
        </Field>
        <Field label="스카우트 상태">
          <Select name="scoutStatus" defaultValue={initialProfile?.scoutStatus ?? "selective"}>
            <SelectTrigger aria-label="스카우트 상태">
              <SelectValue placeholder="스카우트 상태를 선택해주세요." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">적극적으로 받고 있어요</SelectItem>
              <SelectItem value="selective">좋은 제안이면 확인해요</SelectItem>
              <SelectItem value="closed">지금은 받지 않아요</SelectItem>
            </SelectContent>
          </Select>
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
