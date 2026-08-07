import type { DiscoveryPortfolio, DiscoveryPortfolioPage, DiscoveryRole } from "@scouty/api"
import { Bookmark, FileImage, Search, Video } from "lucide-react"
import { type SubmitEvent, useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { trackProductEvent } from "@/lib/analytics"
import { apiUrl } from "@/lib/api"
import { ApiRequestError, request } from "@/lib/api-client"
import { cn } from "@/lib/utils"

export type DiscoveryFeedClient = {
  listPortfolios(input: {
    cursor?: string
    query?: string
    role?: string
  }): Promise<DiscoveryPortfolioPage>
  listRoles(): Promise<DiscoveryRole[]>
}

const defaultClient: DiscoveryFeedClient = {
  async listRoles() {
    return request<DiscoveryRole[]>("/v1/discovery/roles")
  },
  async listPortfolios(input) {
    const query = new URLSearchParams({ limit: "20" })
    if (input.cursor) query.set("cursor", input.cursor)
    if (input.query) query.set("q", input.query)
    if (input.role) query.set("role", input.role)
    return request<DiscoveryPortfolioPage>(`/v1/discovery/portfolios?${query}`)
  },
}

type FeedStatus = "error" | "loading" | "ready"

function ProjectCard({
  isBookmarked,
  onBookmark,
  portfolio,
  roleNames,
}: {
  isBookmarked: boolean
  onBookmark: () => void
  portfolio: DiscoveryPortfolio
  roleNames: Map<string, string>
}) {
  return (
    <Card className="h-full overflow-hidden rounded-2xl shadow-none transition hover:border-primary/30">
      <article>
        <a
          href={`/portfolio?portfolio=${encodeURIComponent(portfolio.id)}`}
          className="block outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <div className="aspect-[4/3] overflow-hidden bg-muted">
            {portfolio.coverUrl ? (
              <img
                src={portfolio.coverUrl}
                alt={`${portfolio.title} 프로젝트 커버`}
                className="size-full object-contain"
                loading="lazy"
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileImage aria-hidden="true" size={32} strokeWidth={1.7} />
                <span className="text-sm">커버 준비 중</span>
              </div>
            )}
          </div>

          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight">{portfolio.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {portfolio.author.nickname} · @{portfolio.author.handle}
                </p>
              </div>
              {portfolio.hasVideo ? (
                <Badge variant="secondary" className="shrink-0">
                  <Video aria-hidden="true" /> 영상
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {portfolio.roles.slice(0, 2).map((role) => (
                <Badge key={role}>{roleNames.get(role) ?? role}</Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {portfolio.tags.slice(0, 3).map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </div>
          </div>
        </a>
        <div className="border-t px-5 py-3">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-muted-foreground"
            aria-pressed={isBookmarked}
            onClick={onBookmark}
          >
            <Bookmark aria-hidden="true" size={17} fill={isBookmarked ? "currentColor" : "none"} />
            {isBookmarked ? "저장됨" : "저장"}
          </button>
        </div>
      </article>
    </Card>
  )
}

function FeedSkeleton() {
  const skeletons = ["first", "second", "third", "fourth", "fifth", "sixth"]

  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="프로젝트 불러오는 중"
      aria-live="polite"
    >
      {skeletons.map((skeleton) => (
        <div key={skeleton} className="overflow-hidden rounded-2xl border bg-card">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DiscoveryFeed({ client = defaultClient }: { client?: DiscoveryFeedClient }) {
  const [roles, setRoles] = useState<DiscoveryRole[]>([])
  const [selectedRole, setSelectedRole] = useState<string>()
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState<string>()
  const [portfolios, setPortfolios] = useState<DiscoveryPortfolio[]>([])
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<FeedStatus>("loading")
  const [roleError, setRoleError] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(false)

  useEffect(() => trackProductEvent("feed_viewed"), [])

  useEffect(() => {
    let active = true

    client
      .listRoles()
      .then((nextRoles) => {
        if (active) setRoles(nextRoles)
      })
      .catch(() => {
        if (active) setRoleError(true)
      })

    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    request<Array<{ id: string }>>("/v1/me/bookmarks")
      .then((saved) => {
        setBookmarks(new Set(saved.map((portfolio) => portfolio.id)))
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    setStatus("loading")

    client
      .listPortfolios({ query: searchQuery, role: selectedRole })
      .then((page) => {
        if (!active) return
        setPortfolios(page.items)
        setNextCursor(page.nextCursor)
        setStatus("ready")
      })
      .catch(() => {
        if (active) setStatus("error")
      })

    return () => {
      active = false
    }
  }, [client, searchQuery, selectedRole])

  const roleNames = useMemo(() => new Map(roles.map((role) => [role.slug, role.name])), [roles])

  function submitSearch(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearchQuery(searchInput.trim() || undefined)
  }

  function resetFilters() {
    setSearchInput("")
    setSearchQuery(undefined)
    setSelectedRole(undefined)
  }

  async function retry() {
    setStatus("loading")
    try {
      const page = await client.listPortfolios({ query: searchQuery, role: selectedRole })
      setPortfolios(page.items)
      setNextCursor(page.nextCursor)
      setStatus("ready")
    } catch {
      setStatus("error")
    }
  }

  async function loadMore() {
    if (!nextCursor || isLoadingMore) return

    setIsLoadingMore(true)
    setLoadMoreError(false)
    try {
      const page = await client.listPortfolios({
        cursor: nextCursor,
        query: searchQuery,
        role: selectedRole,
      })
      setPortfolios((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch {
      setLoadMoreError(true)
    } finally {
      setIsLoadingMore(false)
    }
  }

  async function toggleBookmark(portfolioId: string) {
    const isBookmarked = bookmarks.has(portfolioId)
    try {
      await request(`/v1/me/bookmarks/${encodeURIComponent(portfolioId)}`, {
        method: isBookmarked ? "DELETE" : "PUT",
      })
      setBookmarks((current) => {
        const next = new Set(current)
        if (isBookmarked) next.delete(portfolioId)
        else next.add(portfolioId)
        return next
      })
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        window.location.assign(
          `${apiUrl}/v1/auth/google/start?returnTo=${encodeURIComponent(window.location.pathname)}`,
        )
      }
    }
  }

  return (
    <section aria-labelledby="feed-title">
      <div className="mb-7">
        <p className="mb-2 text-sm font-bold text-primary">프로젝트부터 발견해요</p>
        <h1 id="feed-title" className="text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl">
          새로 올라온 프로젝트
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          소개보다 실제 결과물을 먼저 보고, 함께 만들고 싶은 사람을 발견해보세요.
        </p>
      </div>

      <form className="mb-5 flex gap-2" onSubmit={submitSearch}>
        <label htmlFor="feed-search" className="sr-only">
          프로젝트 제목 또는 태그 검색
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={18}
          />
          <input
            id="feed-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={60}
            placeholder="프로젝트 제목이나 태그를 검색해보세요"
            className="h-12 w-full rounded-xl border bg-card pl-11 pr-4 text-sm outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <Button type="submit" className="h-12 px-4 sm:px-5">
          검색
        </Button>
      </form>

      <fieldset className="mb-8 min-w-0">
        <legend className="sr-only">역할 필터</legend>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            aria-pressed={!selectedRole}
            onClick={() => setSelectedRole(undefined)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition",
              !selectedRole
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:bg-muted",
            )}
          >
            전체
          </button>
          {roles.map((role) => (
            <button
              key={role.slug}
              type="button"
              aria-pressed={selectedRole === role.slug}
              onClick={() => setSelectedRole(role.slug)}
              className={cn(
                "h-11 shrink-0 rounded-full border px-4 text-sm font-semibold transition",
                selectedRole === role.slug
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card hover:bg-muted",
              )}
            >
              {role.name}
            </button>
          ))}
        </div>
        {roleError ? (
          <p className="mt-2 text-sm text-muted-foreground" role="status" aria-live="polite">
            역할 필터를 불러오지 못했어요.
          </p>
        ) : null}
      </fieldset>

      {status === "loading" ? <FeedSkeleton /> : null}

      {status === "error" ? (
        <div className="rounded-2xl border bg-card px-5 py-12 text-center">
          <h2 className="text-lg font-bold">프로젝트를 불러오지 못했어요</h2>
          <p className="mt-2 text-sm text-muted-foreground">연결을 확인한 뒤 다시 시도해주세요.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={retry}>
            다시 시도
          </Button>
        </div>
      ) : null}

      {status === "ready" && portfolios.length === 0 ? (
        <div className="rounded-2xl border bg-card px-5 py-12 text-center">
          <h2 className="text-lg font-bold">
            {selectedRole || searchQuery
              ? "조건에 맞는 프로젝트가 아직 없어요"
              : "아직 공개된 프로젝트가 없어요"}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {selectedRole || searchQuery
              ? "다른 역할이나 검색어로 둘러보세요."
              : "첫 프로젝트를 등록하고 함께할 사람을 만나보세요."}
          </p>
          {selectedRole || searchQuery ? (
            <Button type="button" variant="outline" className="mt-5" onClick={resetFilters}>
              필터 초기화
            </Button>
          ) : (
            <Button asChild className="mt-5">
              <a href="/me">첫 프로젝트 등록하기</a>
            </Button>
          )}
        </div>
      ) : null}

      {status === "ready" && portfolios.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {portfolios.map((portfolio) => (
              <ProjectCard
                key={portfolio.id}
                portfolio={portfolio}
                roleNames={roleNames}
                isBookmarked={bookmarks.has(portfolio.id)}
                onBookmark={() => toggleBookmark(portfolio.id)}
              />
            ))}
          </div>
          {nextCursor ? (
            <div className="mt-8 flex justify-center">
              <Button type="button" variant="outline" disabled={isLoadingMore} onClick={loadMore}>
                {isLoadingMore ? "불러오는 중" : loadMoreError ? "다시 불러오기" : "더 보기"}
              </Button>
            </div>
          ) : null}
          {loadMoreError ? (
            <p
              className="mt-3 text-center text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              다음 프로젝트를 불러오지 못했어요.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
