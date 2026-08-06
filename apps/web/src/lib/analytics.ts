import { apiUrl } from "@/lib/api"

export type PublicProductEvent = "feed_viewed" | "portfolio_viewed" | "profile_viewed"

export function trackProductEvent(name: PublicProductEvent) {
  void fetch(`${apiUrl}/v1/analytics/events`, {
    body: JSON.stringify({ name }),
    credentials: "include",
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined)
}
