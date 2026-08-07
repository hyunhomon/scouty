import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { FilePicker } from "./file-picker"

describe("FilePicker", () => {
  it("opens the hidden file input from an explicit action button", () => {
    render(<FilePicker actionLabel="PDF 선택" accept="application/pdf" />)

    const input = screen.getByLabelText("PDF 선택")
    const click = vi.spyOn(input, "click")

    fireEvent.click(screen.getByRole("button", { name: "PDF 선택" }))

    expect(click).toHaveBeenCalledOnce()
    expect(input).toHaveAttribute("accept", "application/pdf")
  })

  it("shows the selected file name", () => {
    render(<FilePicker actionLabel="파일 선택" helperText="PDF만 가능" />)

    fireEvent.change(screen.getByLabelText("파일 선택"), {
      target: { files: [new File(["portfolio"], "portfolio.pdf", { type: "application/pdf" })] },
    })

    expect(screen.getByText("portfolio.pdf")).toBeInTheDocument()
  })
})
