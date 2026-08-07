import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const databaseName = "scouty-edge"
const bucketName = "scouty"
const apiOrigin = "https://api.greeney.life"
const workspaceRoot = resolve(import.meta.dir, "..")
const wranglerConfig = join(workspaceRoot, "apps", "api", "wrangler.jsonc")
const isRemote = process.argv.includes("--remote")

if (isRemote && !process.argv.includes(`--confirm-reset=${databaseName}`)) {
  throw new Error(
    `프로덕션 초기화에는 --confirm-reset=${databaseName} 옵션이 필요합니다. 실행 전 현재 DB를 자동 백업합니다.`,
  )
}

type Author = {
  bio: string
  handle: string
  id: string
  nickname: string
  roles: string[]
  scoutStatus: "open" | "selective"
  stats: {
    averageResponseSeconds: number
    evaluationCount: number
    mannerTemperature: number
    received: number
    responseCount: number
    responseEligibleCount: number
    sent: number
  }
}

type SeedProject = {
  accent: string
  authorId: string
  background: string
  id: string
  publishedAt: string
  roles: string[]
  slug: string
  subtitle: string
  tags: string[]
  title: string
}

const authors: Author[] = [
  {
    bio: "사용자의 작은 불편을 관찰하고 빠르게 제품으로 검증하는 프로덕트 메이커입니다.",
    handle: "minji_product",
    id: "10000000-0000-4000-8000-000000000001",
    nickname: "김민지",
    roles: ["pm", "service-planning"],
    scoutStatus: "open",
    stats: {
      averageResponseSeconds: 7200,
      evaluationCount: 12,
      mannerTemperature: 42.8,
      received: 18,
      responseCount: 15,
      responseEligibleCount: 16,
      sent: 7,
    },
  },
  {
    bio: "복잡한 흐름을 단순하고 따뜻한 인터페이스로 정리하는 UI·UX 디자이너입니다.",
    handle: "seojin_design",
    id: "10000000-0000-4000-8000-000000000002",
    nickname: "박서진",
    roles: ["ui-ux-design", "branding-design"],
    scoutStatus: "open",
    stats: {
      averageResponseSeconds: 12600,
      evaluationCount: 9,
      mannerTemperature: 41.2,
      received: 14,
      responseCount: 11,
      responseEligibleCount: 12,
      sent: 5,
    },
  },
  {
    bio: "운영 가능한 구조와 관측 가능한 시스템을 만드는 백엔드 개발자입니다.",
    handle: "doyun_server",
    id: "10000000-0000-4000-8000-000000000003",
    nickname: "이도윤",
    roles: ["backend", "ai-data"],
    scoutStatus: "selective",
    stats: {
      averageResponseSeconds: 18000,
      evaluationCount: 15,
      mannerTemperature: 44.1,
      received: 21,
      responseCount: 16,
      responseEligibleCount: 18,
      sent: 9,
    },
  },
  {
    bio: "웹과 앱에서 매끄러운 상호작용을 구현하고 성능을 끝까지 다듬습니다.",
    handle: "hana_codes",
    id: "10000000-0000-4000-8000-000000000004",
    nickname: "최하나",
    roles: ["frontend", "mobile"],
    scoutStatus: "open",
    stats: {
      averageResponseSeconds: 5400,
      evaluationCount: 18,
      mannerTemperature: 45.3,
      received: 25,
      responseCount: 22,
      responseEligibleCount: 23,
      sent: 11,
    },
  },
  {
    bio: "브랜드의 목소리를 발견하고 사람들이 참여하고 싶어지는 콘텐츠를 만듭니다.",
    handle: "yujin_story",
    id: "10000000-0000-4000-8000-000000000005",
    nickname: "정유진",
    roles: ["content", "marketing"],
    scoutStatus: "selective",
    stats: {
      averageResponseSeconds: 21600,
      evaluationCount: 7,
      mannerTemperature: 39.6,
      received: 10,
      responseCount: 8,
      responseEligibleCount: 9,
      sent: 6,
    },
  },
  {
    bio: "가설을 데이터로 확인하고 팀이 바로 행동할 수 있는 인사이트로 번역합니다.",
    handle: "jun_data",
    id: "10000000-0000-4000-8000-000000000006",
    nickname: "오준호",
    roles: ["ai-data", "research"],
    scoutStatus: "open",
    stats: {
      averageResponseSeconds: 10800,
      evaluationCount: 11,
      mannerTemperature: 42.1,
      received: 16,
      responseCount: 13,
      responseEligibleCount: 14,
      sent: 8,
    },
  },
  {
    bio: "초기 팀의 목표와 리듬을 설계해 아이디어가 꾸준히 앞으로 나아가게 합니다.",
    handle: "soyeon_ops",
    id: "10000000-0000-4000-8000-000000000007",
    nickname: "한소연",
    roles: ["project-operations", "presentation"],
    scoutStatus: "selective",
    stats: {
      averageResponseSeconds: 14400,
      evaluationCount: 8,
      mannerTemperature: 40.7,
      received: 13,
      responseCount: 10,
      responseEligibleCount: 11,
      sent: 10,
    },
  },
  {
    bio: "선명한 시각 언어로 제품의 첫인상과 오래 남는 브랜드 경험을 만듭니다.",
    handle: "taeho_visual",
    id: "10000000-0000-4000-8000-000000000008",
    nickname: "임태호",
    roles: ["graphic-design", "branding-design"],
    scoutStatus: "open",
    stats: {
      averageResponseSeconds: 9000,
      evaluationCount: 13,
      mannerTemperature: 43.5,
      received: 19,
      responseCount: 16,
      responseEligibleCount: 17,
      sent: 4,
    },
  },
]

function authorId(index: number) {
  const author = authors[index]
  if (!author) throw new Error(`시드 작성자를 찾을 수 없습니다: ${index}`)
  return author.id
}

const projects: SeedProject[] = [
  {
    accent: "#B9FF66",
    authorId: authorId(3),
    background: "#12251B",
    id: "20000000-0000-4000-8000-000000000001",
    publishedAt: "2026-08-04T10:20:00.000Z",
    roles: ["frontend", "mobile"],
    slug: "pacemate",
    subtitle: "같이 달릴 사람을 10분 안에 만나는 동네 러닝 크루 앱",
    tags: ["러닝", "커뮤니티", "위치기반"],
    title: "PaceMate",
  },
  {
    accent: "#FFB86B",
    authorId: authorId(1),
    background: "#2C1B12",
    id: "20000000-0000-4000-8000-000000000002",
    publishedAt: "2026-08-02T06:40:00.000Z",
    roles: ["service-planning", "ui-ux-design"],
    slug: "fridge-note",
    subtitle: "버리는 식재료를 줄이는 자취생 냉장고 관리 서비스",
    tags: ["식재료", "생활", "제로웨이스트"],
    title: "Fridge Note",
  },
  {
    accent: "#7DD3FC",
    authorId: authorId(2),
    background: "#111D35",
    id: "20000000-0000-4000-8000-000000000003",
    publishedAt: "2026-07-31T12:10:00.000Z",
    roles: ["backend", "ai-data"],
    slug: "morrow",
    subtitle: "소상공인이 내일의 매출을 준비하는 한눈에 보는 리포트",
    tags: ["핀테크", "데이터시각화", "소상공인"],
    title: "Morrow",
  },
  {
    accent: "#FDA4AF",
    authorId: authorId(1),
    background: "#35171F",
    id: "20000000-0000-4000-8000-000000000004",
    publishedAt: "2026-07-28T09:30:00.000Z",
    roles: ["mobile", "ui-ux-design"],
    slug: "pawlog",
    subtitle: "보호자와 병원이 함께 보는 반려동물 건강 기록",
    tags: ["헬스케어", "반려동물", "기록"],
    title: "Pawlog",
  },
  {
    accent: "#C4B5FD",
    authorId: authorId(0),
    background: "#211936",
    id: "20000000-0000-4000-8000-000000000005",
    publishedAt: "2026-07-25T04:15:00.000Z",
    roles: ["pm", "frontend"],
    slug: "tidyup",
    subtitle: "흩어진 회의 내용을 결정과 다음 행동으로 바꾸는 협업 도구",
    tags: ["생산성", "협업", "B2B"],
    title: "TidyUp",
  },
  {
    accent: "#FDE68A",
    authorId: authorId(4),
    background: "#30250E",
    id: "20000000-0000-4000-8000-000000000006",
    publishedAt: "2026-07-22T11:00:00.000Z",
    roles: ["branding-design", "content"],
    slug: "around-art",
    subtitle: "취향과 동선을 연결하는 우리 동네 전시 큐레이션",
    tags: ["문화", "큐레이션", "로컬"],
    title: "Around Art",
  },
  {
    accent: "#93C5FD",
    authorId: authorId(2),
    background: "#101E34",
    id: "20000000-0000-4000-8000-000000000007",
    publishedAt: "2026-07-19T08:50:00.000Z",
    roles: ["backend", "frontend"],
    slug: "peerloop",
    subtitle: "질문하기 편하고 배움이 남는 주니어 개발자 코드리뷰 커뮤니티",
    tags: ["개발자", "커뮤니티", "교육"],
    title: "PeerLoop",
  },
  {
    accent: "#86EFAC",
    authorId: authorId(6),
    background: "#102A20",
    id: "20000000-0000-4000-8000-000000000008",
    publishedAt: "2026-07-16T02:25:00.000Z",
    roles: ["marketing", "mobile"],
    slug: "greenstep",
    subtitle: "매일의 작은 실천을 동네의 탄소 절감으로 연결하는 챌린지",
    tags: ["ESG", "리워드", "커뮤니티"],
    title: "GreenStep",
  },
]

const roleGroups = [
  ["planning", "기획", 1],
  ["design", "디자인", 2],
  ["development", "개발", 3],
  ["content", "콘텐츠", 4],
  ["operations", "운영", 5],
] as const

const roles = [
  ["service-planning", "서비스 기획", "planning", 1],
  ["pm", "PM", "planning", 2],
  ["ui-ux-design", "UI·UX 디자인", "design", 1],
  ["graphic-design", "그래픽 디자인", "design", 2],
  ["branding-design", "브랜딩 디자인", "design", 3],
  ["frontend", "프론트엔드", "development", 1],
  ["backend", "백엔드", "development", 2],
  ["mobile", "모바일", "development", 3],
  ["game", "게임", "development", 4],
  ["ai-data", "AI·데이터", "development", 5],
  ["video", "영상", "content", 1],
  ["marketing", "마케팅", "content", 2],
  ["content", "콘텐츠", "content", 3],
  ["presentation", "발표", "operations", 1],
  ["research", "리서치", "operations", 2],
  ["project-operations", "프로젝트 운영", "operations", 3],
] as const

const roleNames = new Map(roles.map(([slug, name]) => [slug, name]))

function sql(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function coverSvg(project: SeedProject) {
  const rolesCopy = project.roles.map((role) => roleNames.get(role) ?? role).join(" · ")
  const tagsCopy = project.tags.map((tag) => `#${tag}`).join("   ")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${project.background}"/>
      <stop offset="1" stop-color="#080B12"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="70"/></filter>
  </defs>
  <rect width="1200" height="900" rx="48" fill="url(#bg)"/>
  <circle cx="1030" cy="80" r="260" fill="${project.accent}" opacity=".22" filter="url(#blur)"/>
  <circle cx="1050" cy="80" r="150" fill="none" stroke="${project.accent}" stroke-width="2" opacity=".5"/>
  <path d="M80 108h104" stroke="${project.accent}" stroke-width="10" stroke-linecap="round"/>
  <text x="80" y="175" fill="${project.accent}" font-family="Pretendard, sans-serif" font-size="28" font-weight="700">SCOUTY · PROJECT CASE</text>
  <text x="80" y="430" fill="#FFFFFF" font-family="Pretendard, sans-serif" font-size="104" font-weight="800">${xml(project.title)}</text>
  <text x="84" y="505" fill="#E5E7EB" font-family="Pretendard, sans-serif" font-size="32">${xml(project.subtitle)}</text>
  <rect x="80" y="650" width="1040" height="1" fill="#FFFFFF" opacity=".22"/>
  <text x="80" y="718" fill="#FFFFFF" font-family="Pretendard, sans-serif" font-size="27" font-weight="600">${xml(rolesCopy)}</text>
  <text x="80" y="788" fill="${project.accent}" font-family="Pretendard, sans-serif" font-size="25">${xml(tagsCopy)}</text>
</svg>`
}

function assetId(prefix: "3" | "4" | "5", index: number) {
  return `${prefix}0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
}

function pageId(index: number) {
  return `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`
}

function buildSeedSql(assetSizes: Array<{ pdf: number; svg: number }>) {
  const statements = [
    "PRAGMA defer_foreign_keys = ON",
    ...[
      "discovery_portfolio_pages",
      "discovery_portfolios",
      "sync_cursors",
      "notifications",
      "reports",
      "manner_feedback",
      "chat_read_states",
      "chat_messages",
      "chat_rooms",
      "scout_requests",
      "portfolio_bookmarks",
      "portfolio_tags",
      "portfolio_roles",
      "portfolio_pages",
      "portfolios",
      "user_blocks",
      "sessions",
      "user_roles",
      "user_scout_stats",
      "user_profiles",
      "assets",
      "users",
      "tags",
      "roles",
      "role_groups",
      "discovery_roles",
    ].map((table) => `DELETE FROM ${table}`),
  ]

  for (const [slug, name, sortOrder] of roleGroups) {
    statements.push(
      `INSERT INTO role_groups (id, name, slug, sort_order, is_active) VALUES (${sql(`group:${slug}`)}, ${sql(name)}, ${sql(slug)}, ${sortOrder}, 1)`,
    )
  }
  for (const [slug, name, groupSlug, sortOrder] of roles) {
    const group = roleGroups.find(([candidate]) => candidate === groupSlug)
    if (!group) throw new Error(`역할 그룹을 찾을 수 없습니다: ${groupSlug}`)
    statements.push(
      `INSERT INTO roles (id, group_id, name, slug, sort_order, is_active) VALUES (${sql(`role:${slug}`)}, ${sql(`group:${groupSlug}`)}, ${sql(name)}, ${sql(slug)}, ${sortOrder}, 1)`,
      `INSERT INTO discovery_roles (slug, name, group_slug, group_name, group_sort_order, sort_order, is_active) VALUES (${sql(slug)}, ${sql(name)}, ${sql(groupSlug)}, ${sql(group[1])}, ${group[2]}, ${sortOrder}, 1)`,
    )
  }

  for (const author of authors) {
    statements.push(
      `INSERT INTO users (id, auth_provider, auth_subject, email, is_admin, status, created_at, updated_at) VALUES (${sql(author.id)}, 'seed', ${sql(`seed:${author.handle}`)}, NULL, 0, 'active', '2026-07-01T00:00:00.000Z', '2026-08-07T00:00:00.000Z')`,
      `INSERT INTO user_profiles (user_id, avatar_asset_id, nickname, handle, bio, communication_preference, scout_status, profile_completed_at, created_at, updated_at) VALUES (${sql(author.id)}, NULL, ${sql(author.nickname)}, ${sql(author.handle)}, ${sql(author.bio)}, '평일 저녁에 답장이 빨라요.', ${sql(author.scoutStatus)}, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', '2026-08-07T00:00:00.000Z')`,
      `INSERT INTO user_scout_stats (user_id, scout_sent_count, scout_received_count, response_count, response_eligible_count, average_response_seconds, manner_temperature, manner_evaluation_count, manner_formula_version, updated_at) VALUES (${sql(author.id)}, ${author.stats.sent}, ${author.stats.received}, ${author.stats.responseCount}, ${author.stats.responseEligibleCount}, ${author.stats.averageResponseSeconds}, ${author.stats.mannerTemperature}, ${author.stats.evaluationCount}, 1, '2026-08-07T00:00:00.000Z')`,
      ...author.roles.map(
        (role, priority) =>
          `INSERT INTO user_roles (user_id, role_id, priority) VALUES (${sql(author.id)}, ${sql(`role:${role}`)}, ${priority + 1})`,
      ),
    )
  }

  const tagUsage = new Map<string, number>()
  for (const project of projects) {
    for (const tag of project.tags) tagUsage.set(tag, (tagUsage.get(tag) ?? 0) + 1)
  }
  const tagIds = new Map<string, string>()
  let tagIndex = 0
  for (const [tag, usage] of tagUsage) {
    const id = `tag:${String(++tagIndex).padStart(2, "0")}`
    tagIds.set(tag, id)
    statements.push(
      `INSERT INTO tags (id, name, normalized_name, usage_count) VALUES (${sql(id)}, ${sql(tag)}, ${sql(tag.toLocaleLowerCase("ko-KR"))}, ${usage})`,
    )
  }

  projects.forEach((project, index) => {
    const author = authors.find((candidate) => candidate.id === project.authorId)
    if (!author) throw new Error(`작성자를 찾을 수 없습니다: ${project.authorId}`)
    const pdfId = assetId("3", index)
    const imageId = assetId("4", index)
    const thumbnailId = assetId("5", index)
    const storagePrefix = `seed/portfolios/${project.slug}`
    const createdAt = project.publishedAt
    const sizes = assetSizes[index]
    if (!sizes) throw new Error(`에셋 크기를 찾을 수 없습니다: ${project.slug}`)
    statements.push(
      `INSERT INTO assets (id, owner_id, kind, storage_key, mime_type, byte_size, status, metadata, created_at) VALUES (${sql(pdfId)}, ${sql(project.authorId)}, 'portfolio_pdf', ${sql(`${storagePrefix}/source.pdf`)}, 'application/pdf', ${sizes.pdf}, 'ready', '{}', ${sql(createdAt)})`,
      `INSERT INTO assets (id, owner_id, kind, storage_key, mime_type, byte_size, width, height, status, metadata, created_at) VALUES (${sql(imageId)}, ${sql(project.authorId)}, 'portfolio_page', ${sql(`${storagePrefix}/page-1.svg`)}, 'image/svg+xml', ${sizes.svg}, 1200, 900, 'ready', '{}', ${sql(createdAt)})`,
      `INSERT INTO assets (id, owner_id, kind, storage_key, mime_type, byte_size, width, height, status, metadata, created_at) VALUES (${sql(thumbnailId)}, ${sql(project.authorId)}, 'portfolio_thumbnail', ${sql(`${storagePrefix}/thumbnail.svg`)}, 'image/svg+xml', ${sizes.svg}, 1200, 900, 'ready', '{}', ${sql(createdAt)})`,
      `INSERT INTO portfolios (id, author_id, title, pdf_asset_id, page_count, cover_page, status, published_at, created_at, updated_at) VALUES (${sql(project.id)}, ${sql(project.authorId)}, ${sql(project.title)}, ${sql(pdfId)}, 1, 1, 'published', ${sql(project.publishedAt)}, ${sql(createdAt)}, ${sql(createdAt)})`,
      `INSERT INTO portfolio_pages (id, portfolio_id, page_number, image_asset_id, thumbnail_asset_id, width, height) VALUES (${sql(pageId(index))}, ${sql(project.id)}, 1, ${sql(imageId)}, ${sql(thumbnailId)}, 1200, 900)`,
      ...project.roles.map(
        (role) =>
          `INSERT INTO portfolio_roles (portfolio_id, role_id) VALUES (${sql(project.id)}, ${sql(`role:${role}`)})`,
      ),
      ...project.tags.map(
        (tag) =>
          `INSERT INTO portfolio_tags (portfolio_id, tag_id) VALUES (${sql(project.id)}, ${sql(tagIds.get(tag) ?? "")})`,
      ),
      `INSERT INTO discovery_portfolios (portfolio_id, author_id, author_handle, author_nickname, title, cover_url, role_slugs_json, tags_json, published_at, updated_at, has_video, author_avatar_url, author_bio, author_scout_status, video_url) VALUES (${sql(project.id)}, ${sql(project.authorId)}, ${sql(author.handle)}, ${sql(author.nickname)}, ${sql(project.title)}, ${sql(`${apiOrigin}/v1/assets/${thumbnailId}`)}, ${sql(JSON.stringify(project.roles))}, ${sql(JSON.stringify(project.tags))}, ${sql(project.publishedAt)}, ${sql(project.publishedAt)}, 0, NULL, ${sql(author.bio)}, ${sql(author.scoutStatus)}, NULL)`,
      `INSERT INTO discovery_portfolio_pages (portfolio_id, page_number, image_url, width, height) VALUES (${sql(project.id)}, 1, ${sql(`${apiOrigin}/v1/assets/${imageId}`)}, 1200, 900)`,
    )
  })

  statements.push(
    `INSERT INTO sync_cursors (stream, cursor, updated_at) VALUES ('seed', '2026-08-07', '2026-08-07T00:00:00.000Z')`,
  )
  return `${statements.join(";\n")};\n`
}

async function runWrangler(args: string[]) {
  const child = Bun.spawn([process.execPath, "x", "wrangler", ...args], {
    cwd: workspaceRoot,
    stderr: "inherit",
    stdout: "inherit",
  })
  const exitCode = await child.exited
  if (exitCode !== 0) throw new Error(`wrangler ${args.join(" ")} 실패 (${exitCode})`)
}

const workingDirectory = await mkdtemp(join(tmpdir(), "scouty-seed-"))
const mode = isRemote ? "--remote" : "--local"

try {
  const assetSizes: Array<{ pdf: number; svg: number }> = []
  for (const project of projects) {
    const svg = coverSvg(project)
    const pdf = `%PDF-1.4\n% Scouty seed source for ${project.title}\n%%EOF\n`
    const svgPath = join(workingDirectory, `${project.slug}.svg`)
    const pdfPath = join(workingDirectory, `${project.slug}.pdf`)
    await Bun.write(svgPath, svg)
    await Bun.write(pdfPath, pdf)
    assetSizes.push({ pdf: Buffer.byteLength(pdf), svg: Buffer.byteLength(svg) })

    const prefix = `seed/portfolios/${project.slug}`
    for (const [key, file, contentType] of [
      [`${prefix}/page-1.svg`, svgPath, "image/svg+xml"],
      [`${prefix}/thumbnail.svg`, svgPath, "image/svg+xml"],
      [`${prefix}/source.pdf`, pdfPath, "application/pdf"],
    ] as const) {
      await runWrangler([
        "r2",
        "object",
        "put",
        `${bucketName}/${key}`,
        "--file",
        file,
        "--content-type",
        contentType,
        "--cache-control",
        "public, max-age=31536000, immutable",
        mode,
        "--config",
        wranglerConfig,
        "--force",
      ])
    }
  }

  if (isRemote) {
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")
    const backupPath = join(tmpdir(), `${databaseName}-before-seed-${timestamp}.sql`)
    await runWrangler([
      "d1",
      "export",
      databaseName,
      "--remote",
      "--config",
      wranglerConfig,
      "--output",
      backupPath,
    ])
    console.info(`프로덕션 백업: ${backupPath}`)
  }

  const seedPath = join(workingDirectory, "seed.sql")
  await Bun.write(seedPath, buildSeedSql(assetSizes))
  await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--config",
    wranglerConfig,
    "--file",
    seedPath,
    "--yes",
  ])
  await runWrangler([
    "d1",
    "execute",
    databaseName,
    mode,
    "--config",
    wranglerConfig,
    "--command",
    "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM portfolios WHERE status = 'published') AS published_portfolios, (SELECT COUNT(*) FROM discovery_portfolios) AS discovery_portfolios, (SELECT COUNT(*) FROM discovery_portfolio_pages) AS discovery_pages;",
  ])
} finally {
  await rm(workingDirectory, { force: true, recursive: true })
}
