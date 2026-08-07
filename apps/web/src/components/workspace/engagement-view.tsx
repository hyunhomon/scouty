import type {
  ChatMessage,
  ChatMessagePage,
  ChatRoomSummary,
  NotificationSummary,
} from "@scouty/api"
import { Check, ChevronRight, Send } from "lucide-react"
import { type SubmitEvent, useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FilePicker } from "@/components/ui/file-picker"
import { inputClass } from "@/components/ui/form-controls"
import { apiUrl } from "@/lib/api"
import { errorMessage, request, uploadFile } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { LoadingPanel } from "./shell"
import { TrustActions } from "./trust-actions"

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

export function ChatView({ onUnreadChange }: { onUnreadChange: (count: number) => void }) {
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
            setMessage(errorMessage(error, "채팅을 동기화하지 못했어요."))
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
        await uploadFile(ticket.url, image, ticket.headers, "채팅 이미지")
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
      setMessage(errorMessage(error, "메시지를 보내지 못했어요."))
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
      setMessage(errorMessage(error, "매너 평가를 남기지 못했어요."))
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
                    placeholder="메시지를 입력해주세요."
                  />
                  <Button type="submit" aria-label="메시지 보내기">
                    <Send aria-hidden="true" />
                  </Button>
                </div>
                <FilePicker
                  compact
                  name="images"
                  accept="image/jpeg,image/png,image/webp"
                  actionLabel="이미지 첨부"
                  aria-label="채팅 이미지 최대 4장 첨부"
                  multiple
                />
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

export function NotificationsView() {
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
