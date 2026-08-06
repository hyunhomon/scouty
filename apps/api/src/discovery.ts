export type DiscoveryRole = {
  groupName: string
  groupSlug: string
  name: string
  slug: string
}

export type DiscoveryPortfolio = {
  id: string
  author: {
    handle: string
    id: string
    nickname: string
  }
  coverUrl: string | null
  hasVideo: boolean
  publishedAt: string
  roles: string[]
  tags: string[]
  title: string
}

export type DiscoveryCursor = {
  portfolioId: string
  publishedAt: string
}

export type ListDiscoveryPortfoliosInput = {
  cursor?: DiscoveryCursor | undefined
  limit: number
  query?: string | undefined
  role?: string | undefined
}

export type DiscoveryPortfolioPage = {
  items: DiscoveryPortfolio[]
  nextCursor: string | null
}

export interface DiscoveryRepository {
  listPortfolios(input: ListDiscoveryPortfoliosInput): Promise<DiscoveryPortfolioPage>
  listRoles(): Promise<DiscoveryRole[]>
}

const emptyDiscoveryRepository: DiscoveryRepository = {
  async listPortfolios() {
    return { items: [], nextCursor: null }
  },
  async listRoles() {
    return []
  },
}

type DiscoveryRoleRow = {
  group_name: string
  group_slug: string
  name: string
  slug: string
}

type DiscoveryPortfolioRow = {
  author_handle: string
  author_id: string
  author_nickname: string
  cover_url: string | null
  has_video: number
  portfolio_id: string
  published_at: string
  role_slugs_json: string
  tags_json: string
  title: string
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : []
  } catch {
    return []
  }
}

export function encodeDiscoveryCursor(cursor: DiscoveryCursor) {
  return btoa(JSON.stringify(cursor))
}

export function decodeDiscoveryCursor(value: string): DiscoveryCursor | null {
  try {
    const parsed = JSON.parse(atob(value)) as Partial<DiscoveryCursor>

    if (
      typeof parsed.portfolioId !== "string" ||
      parsed.portfolioId.length === 0 ||
      typeof parsed.publishedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.publishedAt))
    ) {
      return null
    }

    return {
      portfolioId: parsed.portfolioId,
      publishedAt: parsed.publishedAt,
    }
  } catch {
    return null
  }
}

export class D1DiscoveryRepository implements DiscoveryRepository {
  constructor(private readonly database: D1Database) {}

  async listRoles() {
    const result = await this.database
      .prepare(
        `SELECT group_name, group_slug, name, slug
         FROM discovery_roles
         WHERE is_active = 1
         ORDER BY group_sort_order ASC, sort_order ASC, slug ASC`,
      )
      .all<DiscoveryRoleRow>()

    return result.results.map((role) => ({
      groupName: role.group_name,
      groupSlug: role.group_slug,
      name: role.name,
      slug: role.slug,
    }))
  }

  async listPortfolios(input: ListDiscoveryPortfoliosInput) {
    const conditions: string[] = []
    const bindings: Array<number | string> = []

    if (input.role) {
      conditions.push(
        "EXISTS (SELECT 1 FROM json_each(p.role_slugs_json) AS role WHERE role.value = ?)",
      )
      bindings.push(input.role)
    }

    const searchQuery = input.query?.trim().toLowerCase()
    if (searchQuery) {
      conditions.push(
        `(LOWER(p.title) LIKE ? ESCAPE '\\'
          OR EXISTS (
            SELECT 1 FROM json_each(p.tags_json) AS tag
            WHERE LOWER(CAST(tag.value AS TEXT)) LIKE ? ESCAPE '\\'
          ))`,
      )
      const escapedQuery = searchQuery
        .replaceAll("\\", "\\\\")
        .replaceAll("%", "\\%")
        .replaceAll("_", "\\_")
      bindings.push(`%${escapedQuery}%`, `%${escapedQuery}%`)
    }

    if (input.cursor) {
      conditions.push("(p.published_at < ? OR (p.published_at = ? AND p.portfolio_id < ?))")
      bindings.push(input.cursor.publishedAt, input.cursor.publishedAt, input.cursor.portfolioId)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const result = await this.database
      .prepare(
        `SELECT
           p.portfolio_id,
           p.author_id,
           p.author_handle,
           p.author_nickname,
           p.title,
           p.cover_url,
           p.has_video,
           p.role_slugs_json,
           p.tags_json,
           p.published_at
         FROM discovery_portfolios AS p
         ${where}
         ORDER BY p.published_at DESC, p.portfolio_id DESC
         LIMIT ?`,
      )
      .bind(...bindings, input.limit + 1)
      .all<DiscoveryPortfolioRow>()

    const hasNextPage = result.results.length > input.limit
    const rows = result.results.slice(0, input.limit)
    const items = rows.map((portfolio) => ({
      id: portfolio.portfolio_id,
      author: {
        handle: portfolio.author_handle,
        id: portfolio.author_id,
        nickname: portfolio.author_nickname,
      },
      coverUrl: portfolio.cover_url,
      hasVideo: portfolio.has_video === 1,
      publishedAt: portfolio.published_at,
      roles: parseStringArray(portfolio.role_slugs_json),
      tags: parseStringArray(portfolio.tags_json),
      title: portfolio.title,
    }))
    const lastItem = items.at(-1)

    return {
      items,
      nextCursor:
        hasNextPage && lastItem
          ? encodeDiscoveryCursor({ portfolioId: lastItem.id, publishedAt: lastItem.publishedAt })
          : null,
    }
  }
}

export function getEmptyDiscoveryRepository() {
  return emptyDiscoveryRepository
}
