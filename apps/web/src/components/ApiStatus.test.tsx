import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ApiStatus } from "./ApiStatus"

describe("ApiStatus", () => {
  it("shows a successful connection", async () => {
    render(<ApiStatus check={async () => true} />)

    expect(await screen.findByText("API 연결됨")).toBeInTheDocument()
  })

  it("handles connection failures", async () => {
    render(<ApiStatus check={async () => false} />)

    expect(await screen.findByText("API 연결 필요")).toBeInTheDocument()
  })
})
