import { CircleCheck, CircleDashed, CircleX } from "lucide-react"
import { useEffect, useState } from "react"
import { request } from "@/lib/api-client"

type Status = "checking" | "online" | "offline"

type ApiStatusProps = {
  check?: () => Promise<boolean>
}

async function checkApi() {
  const data = await request<{ status: string }>("/health")
  return data.status === "ok"
}

export function ApiStatus({ check = checkApi }: ApiStatusProps) {
  const [status, setStatus] = useState<Status>("checking")

  useEffect(() => {
    let active = true

    check()
      .then((online) => {
        if (active) setStatus(online ? "online" : "offline")
      })
      .catch(() => {
        if (active) setStatus("offline")
      })

    return () => {
      active = false
    }
  }, [check])

  const content = {
    checking: { icon: CircleDashed, label: "API 확인 중", className: "text-muted-foreground" },
    online: { icon: CircleCheck, label: "API 연결됨", className: "text-success" },
    offline: { icon: CircleX, label: "API 연결 필요", className: "text-destructive" },
  }[status]
  const Icon = content.icon

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${content.className}`}>
      <Icon
        aria-hidden="true"
        className={status === "checking" ? "animate-spin" : undefined}
        size={14}
      />
      {content.label}
    </span>
  )
}
