import { DurableObject } from "cloudflare:workers"

type ConnectionAttachment = {
  connectedAt: string
  userId: string
}

export class ChatRoomHub extends DurableObject<Cloudflare.Env> {
  override async fetch(request: Request) {
    const url = new URL(request.url)

    if (request.method === "POST" && url.pathname === "/notify") {
      const message = await request.text()
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message)
        } catch {
          socket.close(1011, "delivery failed")
        }
      }
      return new Response(null, { status: 204 })
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 })
    }
    const userId = request.headers.get("x-scouty-user-id")
    if (!userId) return new Response("Unauthorized", { status: 401 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ connectedAt: new Date().toISOString(), userId })
    return new Response(null, { status: 101, webSocket: client })
  }

  override webSocketMessage(socket: WebSocket) {
    socket.send(JSON.stringify({ type: "send_via_http" }))
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string) {
    const attachment = socket.deserializeAttachment() as ConnectionAttachment | null
    socket.close(code, reason || (attachment ? "closed" : "invalid attachment"))
  }
}
