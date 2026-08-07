import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { OnboardingView } from "./onboarding-view"

describe("OnboardingView", () => {
  it("uses accessible custom selects, file actions, and helpful placeholders", () => {
    render(<OnboardingView initialProfile={null} roles={[]} />)

    expect(screen.getByRole("combobox", { name: "스카우트 상태" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "프로필 이미지 선택" })).toBeInTheDocument()

    for (const textbox of screen.getAllByRole("textbox")) {
      expect(textbox).toHaveAttribute("placeholder")
      expect(textbox.getAttribute("placeholder")?.trim()).not.toBe("")
    }
  })
})
