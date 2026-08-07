import { expect, test } from "@playwright/test"

test("anonymous production journey reaches discovery and Google sign-in", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: /스펙보다 결과물로/ })).toBeVisible()
  await expect(page.getByText("API 확인 중")).toHaveCount(0)

  await page.getByRole("link", { name: "둘러보기" }).click()
  await expect(page).toHaveURL(/\/feed\/?$/)
  await expect(page.getByRole("button", { name: "백엔드" })).toBeVisible()

  if ((await page.getByRole("article").count()) === 0) {
    await expect(page.getByRole("link", { name: "첫 프로젝트 등록하기" })).toBeVisible()
    await page.getByRole("link", { name: "첫 프로젝트 등록하기" }).click()
  } else {
    await page.goto("/me")
  }

  await expect(
    page.getByRole("heading", { level: 1, name: "계속하려면 로그인해주세요" }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
    "href",
    /^https:\/\/api\.greeney\.life\/v1\/auth\/google\/start\?returnTo=/,
  )
})

test("anonymous session is valid JSON and protected data stays private", async ({ request }) => {
  const session = await request.get("https://api.greeney.life/v1/auth/session")
  expect(session.status()).toBe(200)
  expect(session.headers()["content-type"]).toContain("application/json")
  expect(await session.json()).toBeNull()

  const profile = await request.get("https://api.greeney.life/v1/me")
  expect(profile.status()).toBe(401)
  await expect(profile.json()).resolves.toMatchObject({ code: "AUTHENTICATION_REQUIRED" })
})
