import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("Cloudflare Pages dynamic routes", () => {
  it("rewrites through canonical trailing-slash pages without dropping route parameters", async () => {
    const redirects = await readFile("public/_redirects", "utf8")

    expect(redirects).toContain("/portfolios/:portfolioId /portfolio/?portfolio=:portfolioId 200")
    expect(redirects).toContain("/profiles/:handle /profile-public/?handle=:handle 200")
    expect(redirects).toContain("/chat/:roomId /chat/?room=:roomId 200")
  })
})
