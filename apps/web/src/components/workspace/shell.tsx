import type { UnreadCounts } from "@scouty/api"
import { Bell, Bookmark, LoaderCircle, MessageCircle, Send, UserRound } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { apiUrl } from "@/lib/api"
import { request } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import type { WorkspaceView } from "./types"

export function LoadingPanel({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div
      className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="animate-spin" aria-hidden="true" size={18} /> {label}
    </div>
  )
}

export function ErrorPanel({ message, retry }: { message: string; retry?: () => void }) {
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

export function SignInPanel() {
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

export function WorkspaceNav({
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
