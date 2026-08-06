import type { DiscoveryPortfolioDetail, DiscoveryRole } from "@scouty/api"
import { ArrowLeft, Bookmark, FileImage } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { trackProductEvent } from "@/lib/analytics"
import { api, apiUrl } from "@/lib/api"

export type ProjectDetailClient = {
  getPortfolio(portfolioId: string): Promise<DiscoveryPortfolioDetail | null>
  listRoles(): Promise<DiscoveryRole[]>
}

const defaultClient: ProjectDetailClient = {
  async getPortfolio(portfolioId) {
    const { data, error } = await api.v1.discovery.portfolios({ portfolioId }).get()

    if (error?.status === 404) return null
    if (error) throw new Error("프로젝트를 불러오지 못했습니다.")
    return data
  },
  async listRoles() {
    const { data, error } = await api.v1.discovery.roles.get()
    if (error) return []
    return data
  },
}

type DetailStatus = "error" | "loading" | "not-found" | "ready"

const scoutStatusCopy = {
  closed: "지금은 받지 않아요",
  open: "적극적으로 받고 있어요",
  selective: "좋은 제안이면 확인해요",
} as const

function Avatar({ avatarUrl, nickname }: { avatarUrl: string | null; nickname: string }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={`${nickname} 프로필`}
        className="size-12 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <span
      className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary"
      aria-hidden="true"
    >
      {nickname.slice(0, 1)}
    </span>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" role="status" aria-label="프로젝트 상세 불러오는 중">
      <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
      <div className="mt-4 h-5 w-1/3 animate-pulse rounded bg-muted" />
      <div className="mt-8 aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}

function BookmarkButton({ portfolioId }: { portfolioId: string }) {
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetch(`${apiUrl}/v1/me/bookmarks`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return
        const data = (await response.json()) as Array<{ id: string }>
        setIsBookmarked(data.some((portfolio) => portfolio.id === portfolioId))
      })
      .catch(() => undefined)
  }, [portfolioId])

  async function toggle() {
    setIsSaving(true)
    const response = await fetch(`${apiUrl}/v1/me/bookmarks/${encodeURIComponent(portfolioId)}`, {
      credentials: "include",
      method: isBookmarked ? "DELETE" : "PUT",
    })
    setIsSaving(false)
    if (response.status === 401) {
      window.location.assign(
        `${apiUrl}/v1/auth/google/start?returnTo=${encodeURIComponent(window.location.pathname)}`,
      )
      return
    }
    if (response.ok) setIsBookmarked((current) => !current)
  }

  return (
    <Button type="button" variant="outline" disabled={isSaving} onClick={toggle}>
      <Bookmark aria-hidden="true" fill={isBookmarked ? "currentColor" : "none"} />
      {isBookmarked ? "저장됨" : "저장"}
    </Button>
  )
}

export function ProjectDetail({
  client = defaultClient,
  portfolioId,
}: {
  client?: ProjectDetailClient
  portfolioId: string
}) {
  const [portfolio, setPortfolio] = useState<DiscoveryPortfolioDetail | null>(null)
  const [roles, setRoles] = useState<DiscoveryRole[]>([])
  const [status, setStatus] = useState<DetailStatus>("loading")

  useEffect(() => {
    let active = true
    setStatus("loading")

    Promise.all([client.getPortfolio(portfolioId), client.listRoles()])
      .then(([nextPortfolio, nextRoles]) => {
        if (!active) return
        setRoles(nextRoles)
        setPortfolio(nextPortfolio)
        setStatus(nextPortfolio ? "ready" : "not-found")
        if (nextPortfolio) trackProductEvent("portfolio_viewed")
      })
      .catch(() => {
        if (active) setStatus("error")
      })

    return () => {
      active = false
    }
  }, [client, portfolioId])

  const roleNames = useMemo(() => new Map(roles.map((role) => [role.slug, role.name])), [roles])

  async function retry() {
    setStatus("loading")
    try {
      const [nextPortfolio, nextRoles] = await Promise.all([
        client.getPortfolio(portfolioId),
        client.listRoles(),
      ])
      setRoles(nextRoles)
      setPortfolio(nextPortfolio)
      setStatus(nextPortfolio ? "ready" : "not-found")
    } catch {
      setStatus("error")
    }
  }

  if (status === "loading") return <DetailSkeleton />

  if (status === "error") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-card px-5 py-12 text-center">
        <h1 className="text-xl font-bold">프로젝트를 불러오지 못했어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">연결을 확인한 뒤 다시 시도해주세요.</p>
        <Button type="button" variant="outline" className="mt-5" onClick={retry}>
          다시 시도
        </Button>
      </div>
    )
  }

  if (status === "not-found" || !portfolio) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-card px-5 py-12 text-center">
        <h1 className="text-xl font-bold">프로젝트를 찾을 수 없어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          보관되었거나 공개되지 않은 프로젝트일 수 있어요.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <a href="/feed">피드로 돌아가기</a>
        </Button>
      </div>
    )
  }

  const isClosed = portfolio.author.scoutStatus === "closed"

  return (
    <article className="mx-auto max-w-3xl" aria-labelledby="project-title">
      <a
        href="/feed"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" size={17} /> 피드
      </a>

      <header>
        <div className="flex items-center gap-3">
          <Avatar avatarUrl={portfolio.author.avatarUrl} nickname={portfolio.author.nickname} />
          <a
            href={`/profiles/${encodeURIComponent(portfolio.author.handle)}`}
            className="min-w-0 rounded outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <p className="truncate font-bold">{portfolio.author.nickname}</p>
            <p className="truncate text-sm text-muted-foreground">@{portfolio.author.handle}</p>
          </a>
        </div>

        <h1
          id="project-title"
          className="mt-6 text-3xl font-extrabold tracking-[-0.03em] sm:text-4xl"
        >
          {portfolio.title}
        </h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {portfolio.roles.map((role) => (
            <Badge key={role}>{roleNames.get(role) ?? role}</Badge>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {portfolio.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        <div className="mt-5">
          <BookmarkButton portfolioId={portfolio.id} />
        </div>
      </header>

      {portfolio.videoUrl ? (
        <section className="mt-8" aria-labelledby="project-video-title">
          <h2 id="project-video-title" className="sr-only">
            프로젝트 영상
          </h2>
          <video
            src={portfolio.videoUrl}
            controls
            muted
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-2xl bg-foreground"
          >
            브라우저에서 영상을 재생할 수 없습니다.
          </video>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="portfolio-pages-title">
        <h2 id="portfolio-pages-title" className="sr-only">
          포트폴리오 페이지
        </h2>
        {portfolio.pages.length > 0 ? (
          <ol className="space-y-3">
            {portfolio.pages.map((page, index) => (
              <li key={page.pageNumber}>
                <img
                  src={page.imageUrl}
                  alt={`${portfolio.title} ${page.pageNumber}페이지`}
                  width={page.width}
                  height={page.height}
                  loading={index === 0 ? "eager" : "lazy"}
                  fetchPriority={index === 0 ? "high" : "auto"}
                  decoding="async"
                  className="h-auto w-full rounded-xl border bg-card"
                />
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl border bg-card text-muted-foreground">
            <FileImage aria-hidden="true" size={32} strokeWidth={1.7} />
            <p className="text-sm">페이지 이미지를 준비하고 있어요.</p>
          </div>
        )}
      </section>

      <Card className="mt-8 rounded-2xl p-5 shadow-none">
        <section aria-labelledby="author-summary-title">
          <div className="flex items-start gap-3">
            <Avatar avatarUrl={portfolio.author.avatarUrl} nickname={portfolio.author.nickname} />
            <div className="min-w-0 flex-1">
              <h2 id="author-summary-title" className="font-bold">
                {portfolio.author.nickname}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{portfolio.author.bio}</p>
              <p className="mt-3 text-sm font-semibold text-primary">
                {scoutStatusCopy[portfolio.author.scoutStatus]}
              </p>
            </div>
          </div>

          <div className="mt-5 border-t pt-5">
            {isClosed ? (
              <Button type="button" className="w-full" disabled>
                지금은 제안을 받지 않아요
              </Button>
            ) : (
              <Button asChild className="w-full">
                <a href={`/scout?portfolio=${encodeURIComponent(portfolio.id)}`}>스카우트 제안</a>
              </Button>
            )}
            {!isClosed ? (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                로그인 후 구체적인 역할과 프로젝트 정보를 담아 제안할 수 있어요.
              </p>
            ) : null}
          </div>
        </section>
      </Card>

      {portfolio.otherProjects.length > 0 ? (
        <section className="mt-10" aria-labelledby="other-projects-title">
          <h2 id="other-projects-title" className="text-xl font-extrabold tracking-tight">
            이 작성자의 다른 프로젝트
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {portfolio.otherProjects.map((project) => (
              <a
                key={project.id}
                href={`/portfolios/${encodeURIComponent(project.id)}`}
                className="overflow-hidden rounded-2xl border bg-card outline-none transition hover:border-primary/30 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div className="aspect-[4/3] bg-muted">
                  {project.coverUrl ? (
                    <img
                      src={project.coverUrl}
                      alt=""
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : null}
                </div>
                <p className="truncate p-4 text-sm font-bold">{project.title}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  )
}

function getPortfolioId(pathname: string) {
  const match = pathname.match(/^\/portfolios\/([^/]+)\/?$/)
  if (!match?.[1]) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function ProjectDetailRoute({ client = defaultClient }: { client?: ProjectDetailClient }) {
  const portfolioId = getPortfolioId(window.location.pathname)

  if (!portfolioId) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border bg-card px-5 py-12 text-center">
        <h1 className="text-xl font-bold">올바르지 않은 프로젝트 주소예요</h1>
        <Button asChild variant="outline" className="mt-5">
          <a href="/feed">피드로 돌아가기</a>
        </Button>
      </div>
    )
  }

  return <ProjectDetail client={client} portfolioId={portfolioId} />
}
