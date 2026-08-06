import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { mockAuthenticatedApi, mockPublicApi, mockSignedOutApi } from "./fixtures"

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

test("authentication offers Google SSO only", async ({ page }) => {
  await mockSignedOutApi(page)
  await page.goto("/me")

  await expect(
    page.getByRole("heading", { level: 1, name: "계속하려면 로그인해주세요" }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
    "href",
    /\/v1\/auth\/google\/start\?returnTo=/,
  )
  await expect(page.locator('input[type="password"]')).toHaveCount(0)

  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(results.violations).toEqual([])
})

test("public discovery is keyboard accessible and responsive", async ({ page }) => {
  await mockPublicApi(page)
  await page.setViewportSize({ height: 720, width: 320 })
  await page.goto("/feed")

  await expect(page.getByRole("heading", { level: 1, name: "새로 올라온 프로젝트" })).toBeVisible()
  await expect(page.getByRole("article")).toHaveCount(5)

  await page.keyboard.press("Tab")
  const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(page.locator("#main-content")).toBeFocused()

  await page.getByRole("button", { name: "백엔드" }).click()
  await expect(page.getByRole("article")).toHaveCount(1)
  await page.getByRole("textbox", { name: "프로젝트 제목 또는 태그 검색" }).fill("실전")
  await page.getByRole("button", { name: "검색" }).click()
  await expect(page.getByRole("article")).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )

  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(results.violations).toEqual([])

  const fontBudget = await page.evaluate(async () => {
    await document.fonts.ready
    const fonts = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes(".woff2")) as PerformanceResourceTiming[]
    return {
      largestBytes: Math.max(...fonts.map((entry) => entry.encodedBodySize), 0),
      requests: fonts.length,
      totalBytes: fonts.reduce((total, entry) => total + entry.encodedBodySize, 0),
    }
  })
  expect(fontBudget.requests).toBeGreaterThan(0)
  expect(fontBudget.largestBytes).toBeLessThan(128 * 1024)
  expect(fontBudget.totalBytes).toBeLessThan(1024 * 1024)
})

test("project details preserve PDF order and pass automated WCAG checks", async ({ page }) => {
  await mockPublicApi(page)
  await page.goto("/portfolio?portfolio=portfolio-1")

  await expect(page.getByRole("heading", { level: 1, name: "실전 프로젝트 1" })).toBeVisible()
  await expect(page.getByRole("img", { name: "실전 프로젝트 1 1페이지" })).toBeVisible()
  await expect(page.getByRole("link", { name: "스카우트 제안" })).toHaveAttribute(
    "href",
    "/scout?portfolio=portfolio-1",
  )

  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(results.violations).toEqual([])
})

test("received proposal continues through chat and manner feedback", async ({ page }) => {
  await mockAuthenticatedApi(page)
  await page.goto("/requests")

  await expect(page.getByRole("heading", { level: 1, name: "스카우트 제안" })).toBeVisible()
  await expect(page.getByText("새 제안")).toBeVisible()
  await page.getByRole("button", { name: "수락" }).click()

  await expect(page).toHaveURL(/\/chat\/?\?room=room-1$/)
  await expect(page.getByRole("heading", { level: 1, name: "채팅" })).toBeVisible()
  await expect(page.getByText("함께 이야기해봐요.", { exact: true }).last()).toBeVisible()
  await page.getByRole("textbox", { name: "메시지" }).fill("좋아요, 바로 시작해요.")
  await page.getByRole("button", { name: "메시지 보내기" }).click()
  await expect(page.getByText("좋아요, 바로 시작해요.", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "좋았어요" }).click()
  await expect(page.getByRole("status")).toContainText("매너 평가를 남겼어요.")

  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze()
  expect(results.violations).toEqual([])
})

test("Pages serves the production security policy", async ({ request }) => {
  const response = await request.get("/")
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'")
  expect(response.headers()["permissions-policy"]).toContain("camera=()")
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin")
  expect(response.headers()["x-content-type-options"]).toBe("nosniff")
  expect(response.headers()["x-frame-options"]).toBe("DENY")
})
