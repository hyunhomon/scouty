import type { PortfolioSummary, ProfileSummary } from "@scouty/api"
import { useCallback, useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { inputClass } from "@/components/ui/form-controls"
import { apiUrl } from "@/lib/api"
import { errorMessage, request } from "@/lib/api-client"
import { PortfolioCard, PortfolioUploader } from "./portfolio-editor"
import type { Role } from "./types"

export function ProfileView({ profile, roles }: { profile: ProfileSummary; roles: Role[] }) {
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
              placeholder="탈퇴"
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
                setDeleteError(errorMessage(error, "계정을 삭제하지 못했어요."))
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

export function TrustStats({ stats }: { stats: ProfileSummary["stats"] }) {
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
