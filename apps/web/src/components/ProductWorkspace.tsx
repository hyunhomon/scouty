import type { ProfileSummary, PublicProfile, SessionUser, UnreadCounts } from "@scouty/api"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { trackProductEvent } from "@/lib/analytics"
import { apiUrl } from "@/lib/api"
import { errorMessage, request } from "@/lib/api-client"
import { ChatView, NotificationsView } from "./workspace/engagement-view"
import { OnboardingView } from "./workspace/onboarding-view"
import { ProfileView, TrustStats } from "./workspace/profile-view"
import { RequestsView, ScoutView } from "./workspace/scout-view"
import { ErrorPanel, LoadingPanel, SignInPanel, WorkspaceNav } from "./workspace/shell"
import { TrustActions } from "./workspace/trust-actions"
import type { Role, WorkspaceView } from "./workspace/types"

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
      setError(errorMessage(caught, "화면을 불러오지 못했어요."))
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
  const [viewerUserId, setViewerUserId] = useState<string | null>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!handle) {
      setProfile(null)
      return
    }
    Promise.all([
      request<PublicProfile | null>(`/v1/profiles/${encodeURIComponent(handle)}`),
      request<SessionUser | null>("/v1/auth/session").catch(() => null),
    ])
      .then(([nextProfile, session]) => {
        setProfile(nextProfile)
        setViewerUserId(session?.id ?? null)
        if (nextProfile) trackProductEvent("profile_viewed")
      })
      .catch((caught) => setError(errorMessage(caught, "프로필을 불러오지 못했어요.")))
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
      {viewerUserId && viewerUserId !== profile.userId ? (
        <TrustActions userId={profile.userId} />
      ) : null}
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
