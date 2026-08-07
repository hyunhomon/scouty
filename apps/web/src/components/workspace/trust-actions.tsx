import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { errorMessage, request } from "@/lib/api-client"

export function TrustActions({ userId, onBlocked }: { userId: string; onBlocked?: () => void }) {
  const [message, setMessage] = useState<string>()
  const [reasonCode, setReasonCode] = useState("spam")

  async function block() {
    try {
      await request(`/v1/me/blocks/${userId}`, { method: "PUT" })
      setMessage("이 사용자를 차단했어요.")
      onBlocked?.()
    } catch (error) {
      setMessage(errorMessage(error, "차단하지 못했어요."))
    }
  }

  async function reportUser() {
    try {
      await request("/v1/reports", {
        method: "POST",
        body: JSON.stringify({ reasonCode, targetId: userId, targetType: "user" }),
      })
      setMessage("신고를 접수했어요.")
    } catch (error) {
      setMessage(errorMessage(error, "신고하지 못했어요."))
    }
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={block}>
        차단
      </Button>
      <Select value={reasonCode} onValueChange={setReasonCode}>
        <SelectTrigger aria-label="신고 사유" className="w-48">
          <SelectValue placeholder="신고 사유 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="identity_theft">도용·사칭</SelectItem>
          <SelectItem value="spam">스팸 제안</SelectItem>
          <SelectItem value="harassment">괴롭힘</SelectItem>
          <SelectItem value="personal_information_request">개인정보 요구</SelectItem>
          <SelectItem value="irrelevant_commercial">무관한 영리 홍보</SelectItem>
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" onClick={reportUser}>
        신고
      </Button>
      {message ? (
        <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
          {message}
        </span>
      ) : null}
    </div>
  )
}
