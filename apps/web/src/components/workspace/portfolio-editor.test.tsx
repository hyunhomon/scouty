import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PortfolioUploader } from "./portfolio-editor"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("PortfolioUploader", () => {
  it("resets the captured form after an asynchronous PDF upload completes", async () => {
    const onCreated = vi.fn()
    const pdf = new File(["%PDF-1.7"], "portfolio.pdf", { type: "application/pdf" })
    const formValues = new Map<string, FormDataEntryValue>([
      ["pdf", pdf],
      ["tags", "프로덕트, 협업"],
      ["title", "Scouty"],
    ])
    vi.stubGlobal(
      "FormData",
      class {
        get(name: string) {
          return formValues.get(name) ?? null
        }
      },
    )
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === "/v1/me/portfolios" && init?.method === "POST") {
        return Response.json({
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          portfolioId: "portfolio-1",
          uploads: [
            {
              assetId: "asset-1",
              headers: { "content-type": "application/pdf" },
              kind: "pdf",
              url: "http://localhost:8787/v1/me/uploads/asset-1",
            },
          ],
        })
      }
      if (path === "/v1/me/uploads/asset-1" && init?.method === "PUT") {
        return new Response(null, { status: 204 })
      }
      if (path === "/v1/me/portfolios/portfolio-1/uploads/complete") {
        return Response.json({ ok: true })
      }
      return new Response(null, { status: 404 })
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <PortfolioUploader
        roles={[{ groupName: "기획", groupSlug: "planning", name: "PM", slug: "pm" }]}
        onCreated={onCreated}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText("예: 지역 기반 러닝 크루 앱"), {
      target: { value: "Scouty" },
    })
    fireEvent.change(screen.getByLabelText("포트폴리오 PDF 선택"), {
      target: {
        files: [pdf],
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "PM" }))
    fireEvent.change(screen.getByPlaceholderText("핀테크, 모바일"), {
      target: { value: "프로덕트, 협업" },
    })
    const submitButton = screen.getByRole("button", { name: "프로젝트 등록" })
    const form = submitButton.closest("form")
    if (!form) throw new Error("Project form was not rendered")
    fireEvent.submit(form)

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    expect(screen.queryByText(/Cannot read properties of null/)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText("예: 지역 기반 러닝 크루 앱")).toHaveValue("")
    expect(screen.getByText("프로젝트 결과를 보여주는 PDF를 선택해주세요.")).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/me/portfolios/portfolio-1/uploads"),
      expect.objectContaining({ method: "DELETE" }),
    )
  })
})
