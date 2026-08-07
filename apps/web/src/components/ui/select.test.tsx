import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select"

describe("SelectContent", () => {
  it("keeps the Radix portal content in the top overlay layer", () => {
    render(
      <Select defaultOpen defaultValue="designer">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="designer">디자이너</SelectItem>
        </SelectContent>
      </Select>,
    )

    const content = document.querySelector<HTMLElement>("[data-slot='select-content']")
    expect(content).not.toBeNull()
    expect(content).toHaveStyle({ zIndex: "2147483647" })
    expect(content?.closest("[data-radix-popper-content-wrapper]")).not.toBeNull()
  })
})
