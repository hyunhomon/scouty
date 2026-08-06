CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "users" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "user_profiles_handle_ci_key"
  ON "user_profiles" (lower("handle"))
  WHERE "handle" IS NOT NULL;

ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_handle_format_check" CHECK (
    "handle" IS NULL OR "handle" ~ '^[a-z0-9_]{3,20}$'
  );

ALTER TABLE "scout_requests"
  ADD CONSTRAINT "scout_requests_terminal_timestamps_check" CHECK (
    ("status" = 'pending' AND "responded_at" IS NULL AND "canceled_at" IS NULL)
    OR ("status" IN ('accepted', 'declined') AND "responded_at" IS NOT NULL AND "canceled_at" IS NULL)
    OR ("status" = 'canceled' AND "responded_at" IS NULL AND "canceled_at" IS NOT NULL)
  );
