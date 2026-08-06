ALTER TABLE discovery_portfolios
ADD COLUMN author_avatar_url TEXT;

ALTER TABLE discovery_portfolios
ADD COLUMN author_bio TEXT NOT NULL DEFAULT '';

ALTER TABLE discovery_portfolios
ADD COLUMN author_scout_status TEXT NOT NULL DEFAULT 'selective'
CHECK (author_scout_status IN ('open', 'selective', 'closed'));

ALTER TABLE discovery_portfolios
ADD COLUMN video_url TEXT;

CREATE TABLE discovery_portfolio_pages (
  portfolio_id TEXT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number > 0),
  image_url TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  PRIMARY KEY (portfolio_id, page_number),
  FOREIGN KEY (portfolio_id)
    REFERENCES discovery_portfolios (portfolio_id)
    ON DELETE CASCADE
);

CREATE INDEX discovery_portfolio_pages_portfolio_idx
  ON discovery_portfolio_pages (portfolio_id, page_number);
