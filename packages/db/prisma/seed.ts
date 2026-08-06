import { createPrismaClient } from "../src/client"

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database")
}

const prisma = createPrismaClient(connectionString)

const roleGroups = [
  {
    name: "기획",
    slug: "planning",
    roles: [
      { name: "서비스 기획", slug: "service-planning" },
      { name: "PM", slug: "pm" },
    ],
  },
  {
    name: "디자인",
    slug: "design",
    roles: [
      { name: "UI·UX 디자인", slug: "ui-ux-design" },
      { name: "그래픽 디자인", slug: "graphic-design" },
      { name: "브랜딩 디자인", slug: "branding-design" },
    ],
  },
  {
    name: "개발",
    slug: "development",
    roles: [
      { name: "프론트엔드", slug: "frontend" },
      { name: "백엔드", slug: "backend" },
      { name: "모바일", slug: "mobile" },
      { name: "게임", slug: "game" },
      { name: "AI·데이터", slug: "ai-data" },
    ],
  },
  {
    name: "콘텐츠",
    slug: "content",
    roles: [
      { name: "영상", slug: "video" },
      { name: "마케팅", slug: "marketing" },
      { name: "콘텐츠", slug: "content" },
    ],
  },
  {
    name: "운영",
    slug: "operations",
    roles: [
      { name: "발표", slug: "presentation" },
      { name: "리서치", slug: "research" },
      { name: "프로젝트 운영", slug: "project-operations" },
    ],
  },
] as const

for (const [groupIndex, groupSeed] of roleGroups.entries()) {
  const group = await prisma.roleGroup.upsert({
    where: { slug: groupSeed.slug },
    update: {
      name: groupSeed.name,
      sortOrder: groupIndex + 1,
      isActive: true,
    },
    create: {
      name: groupSeed.name,
      slug: groupSeed.slug,
      sortOrder: groupIndex + 1,
    },
  })

  for (const [roleIndex, roleSeed] of groupSeed.roles.entries()) {
    await prisma.role.upsert({
      where: { slug: roleSeed.slug },
      update: {
        groupId: group.id,
        name: roleSeed.name,
        sortOrder: roleIndex + 1,
        isActive: true,
      },
      create: {
        groupId: group.id,
        name: roleSeed.name,
        slug: roleSeed.slug,
        sortOrder: roleIndex + 1,
      },
    })
  }
}

await prisma.$disconnect()

console.info(`Seeded ${roleGroups.length} role groups`)
