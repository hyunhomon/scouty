CREATE TABLE discovery_portfolios (
  portfolio_id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  author_handle TEXT NOT NULL,
  author_nickname TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT,
  role_slugs_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX discovery_portfolios_published_at_idx
  ON discovery_portfolios (published_at DESC, portfolio_id DESC);

CREATE TABLE sync_cursors (
  stream TEXT PRIMARY KEY,
  cursor TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
