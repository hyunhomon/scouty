import { describe, expect, it } from "vitest"
import { createOriginRequest } from "./domain-worker"

describe("Pages domain gateway", () => {
  it("preserves the path and query while replacing the origin", () => {
    const request = createOriginRequest(
      new Request("https://greeney.life/brand/scouty.svg?v=1"),
      "scouty-web.pages.dev",
    )

    expect(request.url).toBe("https://scouty-web.pages.dev/brand/scouty.svg?v=1")
  })
})
