import type { PortfolioSummary, ScoutCandidate, ScoutRequestSummary } from "@scouty/api"
import { Bookmark } from "lucide-react"
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Field, inputClass, textareaClass } from "@/components/ui/form-controls"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { errorMessage, request } from "@/lib/api-client"
import { ErrorPanel } from "./shell"
import type { Role } from "./types"

export function ScoutView({ roles }: { roles: Role[] }) {
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
      .catch((error) => setMessage(errorMessage(error, "프로젝트를 불러오지 못했어요.")))
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
      setMessage(errorMessage(error, "제안을 보내지 못했어요."))
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">한 장씩 깊게</p>
          <h1 className="mt-2 text-3xl font-extrabold">스카우트</h1>
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger aria-label="탐색할 역할" className="w-44">
            <SelectValue placeholder="역할 선택" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((item) => (
              <SelectItem key={item.slug} value={item.slug}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              <Select name="requestedRoleSlug" defaultValue={candidate.author.roles[0]?.slug}>
                <SelectTrigger aria-label="필요한 역할">
                  <SelectValue placeholder="역할을 선택해주세요." />
                </SelectTrigger>
                <SelectContent>
                  {candidate.author.roles.map((item) => (
                    <SelectItem key={item.slug} value={item.slug}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="제안 프로젝트명">
              <input
                className={inputClass}
                name="projectTitle"
                maxLength={80}
                placeholder="예: 반려동물 건강 기록 서비스"
                required
              />
            </Field>
            <Field label="한 줄 소개">
              <input
                className={inputClass}
                name="projectSummary"
                maxLength={160}
                placeholder="어떤 문제를 해결하는 프로젝트인지 알려주세요."
                required
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="예상 기간">
                <input
                  className={inputClass}
                  name="estimatedPeriodText"
                  maxLength={60}
                  placeholder="예: 3개월"
                  required
                />
              </Field>
              <Field label="주당 활동량">
                <input
                  className={inputClass}
                  name="weeklyCommitmentText"
                  maxLength={60}
                  placeholder="예: 주 8시간"
                  required
                />
              </Field>
            </div>
            <Field label="현재 팀 구성">
              <input
                className={inputClass}
                name="teamCompositionText"
                maxLength={120}
                placeholder="예: 기획 1명, 프론트엔드 1명"
                required
              />
            </Field>
            <Field label="메시지">
              <textarea
                className={textareaClass}
                name="message"
                maxLength={500}
                placeholder="함께하고 싶은 이유와 기대하는 역할을 구체적으로 적어주세요."
                required
              />
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

export function RequestsView({ onRead }: { onRead: () => Promise<void> }) {
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
