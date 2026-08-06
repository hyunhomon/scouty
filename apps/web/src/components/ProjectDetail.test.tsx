import type { DiscoveryPortfolioDetail } from "@scouty/api"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProjectDetail, type ProjectDetailClient } from "./ProjectDetail"

const portfolio: DiscoveryPortfolioDetail = {
  id: "portfolio-1",
  author: {
    avatarUrl: null,
    bio: "사용자의 문제를 관찰하고 화면으로 풀어요.",
    handle: "minji",
    id: "user-1",
    nickname: "민지",
    scoutStatus: "selective",
  },
  coverUrl: "https://assets.scouty.test/portfolio-1/cover.webp",
  hasVideo: true,
  otherProjects: [
    {
      coverUrl: null,
      id: "portfolio-2",
      publishedAt: "2026-08-05T12:00:00.000Z",
      title: "캠퍼스 지도 개선",
    },
  ],
  pages: [
    {
      height: 1600,
      imageUrl: "https://assets.scouty.test/portfolio-1/pages/1.webp",
      pageNumber: 1,
      width: 1200,
    },
    {
      height: 1600,
      imageUrl: "https://assets.scouty.test/portfolio-1/pages/2.webp",
      pageNumber: 2,
      width: 1200,
    },
  ],
  publishedAt: "2026-08-06T12:00:00.000Z",
  roles: ["ui-ux-design"],
  tags: ["핀테크", "모바일"],
  title: "대학생 금융 습관 서비스",
  videoUrl: "https://assets.scouty.test/portfolio-1/video.mp4",
}

function createClient(detail: DiscoveryPortfolioDetail | null = portfolio): ProjectDetailClient {
  return {
    getPortfolio: async () => detail,
    listRoles: async () => [
      {
        groupName: "디자인",
        groupSlug: "design",
        name: "UI·UX 디자인",
        slug: "ui-ux-design",
      },
    ],
  }
}

describe("ProjectDetail", () => {
  it("renders ordered page images and project context", async () => {
    const { container } = render(
      <ProjectDetail client={createClient()} portfolioId="portfolio-1" />,
    )

    expect(
      await screen.findByRole("heading", { name: "대학생 금융 습관 서비스" }),
    ).toBeInTheDocument()
    expect(screen.getByText("UI·UX 디자인")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "대학생 금융 습관 서비스 1페이지" })).toHaveAttribute(
      "loading",
      "eager",
    )
    expect(screen.getByRole("img", { name: "대학생 금융 습관 서비스 2페이지" })).toHaveAttribute(
      "loading",
      "lazy",
    )
    expect(container.querySelector("video")).toHaveAttribute("preload", "metadata")
    expect(screen.getByRole("link", { name: /캠퍼스 지도 개선/ })).toHaveAttribute(
      "href",
      "/portfolios/portfolio-2",
    )
  })

  it("shows a stable not-found state", async () => {
    render(<ProjectDetail client={createClient(null)} portfolioId="missing" />)

    expect(await screen.findByText("프로젝트를 찾을 수 없어요")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "피드로 돌아가기" })).toHaveAttribute("href", "/feed")
  })

  it("disables the scout action until authentication is available", async () => {
    render(<ProjectDetail client={createClient()} portfolioId="portfolio-1" />)

    expect(await screen.findByRole("button", { name: "스카우트 제안" })).toBeDisabled()
    expect(
      screen.getByText("로그인 기능과 함께 제안 보내기가 열릴 예정이에요."),
    ).toBeInTheDocument()
  })
})
