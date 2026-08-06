-- Canonical Scouty schema for Cloudflare D1.
-- Generated from packages/db/prisma/schema.prisma; discovery projection tables stay in migrations 0001-0003.


-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auth_provider" TEXT NOT NULL,
    "auth_subject" TEXT NOT NULL,
    "email" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "avatar_asset_id" TEXT,
    "nickname" TEXT,
    "handle" TEXT,
    "bio" TEXT,
    "communication_preference" TEXT,
    "scout_status" TEXT NOT NULL DEFAULT 'selective',
    "profile_completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_profiles_handle_format_check" CHECK (
        "handle" IS NULL OR (length("handle") BETWEEN 3 AND 20 AND "handle" NOT GLOB '*[^a-z0-9_]*')
    ),
    CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_profiles_avatar_asset_id_fkey" FOREIGN KEY ("avatar_asset_id") REFERENCES "assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "role_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "role_groups_sort_order_check" CHECK ("sort_order" > 0)
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "roles_sort_order_check" CHECK ("sort_order" > 0),
    CONSTRAINT "roles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "role_groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    CONSTRAINT "user_roles_priority_check" CHECK ("priority" BETWEEN 1 AND 3),

    PRIMARY KEY ("user_id", "role_id"),
    CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'uploading',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "purged_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assets_dimensions_check" CHECK (
        "byte_size" >= 0
        AND ("width" IS NULL OR "width" > 0)
        AND ("height" IS NULL OR "height" > 0)
        AND ("duration_seconds" IS NULL OR "duration_seconds" > 0)
    ),
    CONSTRAINT "assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pdf_asset_id" TEXT NOT NULL,
    "video_asset_id" TEXT,
    "replacement_pdf_asset_id" TEXT,
    "replacement_video_asset_id" TEXT,
    "replacement_status" TEXT,
    "replacement_error_code" TEXT,
    "video_processing_error_code" TEXT,
    "page_count" INTEGER,
    "cover_page" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "processing_error_code" TEXT,
    "published_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "portfolios_page_bounds_check" CHECK (
        ("page_count" IS NULL OR "page_count" BETWEEN 1 AND 50)
        AND "cover_page" >= 1
        AND ("page_count" IS NULL OR "cover_page" <= "page_count")
    ),
    CONSTRAINT "portfolios_published_at_check" CHECK ("status" <> 'published' OR "published_at" IS NOT NULL),
    CONSTRAINT "portfolios_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "portfolios_pdf_asset_id_fkey" FOREIGN KEY ("pdf_asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "portfolios_video_asset_id_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "portfolios_replacement_pdf_asset_id_fkey" FOREIGN KEY ("replacement_pdf_asset_id") REFERENCES "assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "portfolios_replacement_video_asset_id_fkey" FOREIGN KEY ("replacement_video_asset_id") REFERENCES "assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolio_pages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolio_id" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "image_asset_id" TEXT NOT NULL,
    "thumbnail_asset_id" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    CONSTRAINT "portfolio_pages_geometry_check" CHECK ("page_number" >= 1 AND "width" > 0 AND "height" > 0),
    CONSTRAINT "portfolio_pages_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "portfolio_pages_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "portfolio_pages_thumbnail_asset_id_fkey" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolio_roles" (
    "portfolio_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    PRIMARY KEY ("portfolio_id", "role_id"),
    CONSTRAINT "portfolio_roles_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "portfolio_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tags_usage_count_check" CHECK ("usage_count" >= 0)
);

-- CreateTable
CREATE TABLE "portfolio_tags" (
    "portfolio_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    PRIMARY KEY ("portfolio_id", "tag_id"),
    CONSTRAINT "portfolio_tags_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "portfolio_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "portfolio_bookmarks" (
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("user_id", "portfolio_id"),
    CONSTRAINT "portfolio_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "portfolio_bookmarks_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scout_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sender_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "source_portfolio_id" TEXT NOT NULL,
    "source_portfolio_title_snapshot" TEXT NOT NULL,
    "requested_role_id" TEXT NOT NULL,
    "project_title" TEXT NOT NULL,
    "project_summary" TEXT NOT NULL,
    "estimated_period_text" TEXT NOT NULL,
    "weekly_commitment_text" TEXT NOT NULL,
    "team_composition_text" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responded_at" DATETIME,
    "canceled_at" DATETIME,
    "invalidated_at" DATETIME,
    "sender_read_at" DATETIME,
    "recipient_read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "scout_requests_participants_check" CHECK ("sender_id" <> "recipient_id"),
    CONSTRAINT "scout_requests_terminal_timestamps_check" CHECK (
        ("status" = 'pending' AND "responded_at" IS NULL AND "canceled_at" IS NULL)
        OR ("status" IN ('accepted', 'declined') AND "responded_at" IS NOT NULL AND "canceled_at" IS NULL)
        OR ("status" = 'canceled' AND "responded_at" IS NULL AND "canceled_at" IS NOT NULL)
    ),
    CONSTRAINT "scout_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scout_requests_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scout_requests_source_portfolio_id_fkey" FOREIGN KEY ("source_portfolio_id") REFERENCES "portfolios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scout_requests_requested_role_id_fkey" FOREIGN KEY ("requested_role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scout_request_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_rooms_scout_request_id_fkey" FOREIGN KEY ("scout_request_id") REFERENCES "scout_requests" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "room_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "client_message_id" TEXT,
    "type" TEXT NOT NULL,
    "body" TEXT,
    "asset_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" DATETIME,
    CONSTRAINT "chat_messages_payload_check" CHECK (
        ("type" = 'text' AND "body" IS NOT NULL AND length(trim("body")) > 0)
        OR ("type" = 'image' AND "asset_id" IS NOT NULL)
        OR ("type" = 'system' AND "body" IS NOT NULL AND length(trim("body")) > 0)
    ),
    CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chat_messages_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "chat_read_states" (
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_read_message_id" TEXT,
    "read_at" DATETIME NOT NULL,

    PRIMARY KEY ("room_id", "user_id"),
    CONSTRAINT "chat_read_states_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_read_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "chat_read_states_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "chat_messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "manner_feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scout_request_id" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "manner_feedback_participants_check" CHECK ("from_user_id" <> "to_user_id"),
    CONSTRAINT "manner_feedback_scout_request_id_fkey" FOREIGN KEY ("scout_request_id") REFERENCES "scout_requests" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "manner_feedback_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "manner_feedback_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_scout_stats" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "scout_sent_count" INTEGER NOT NULL DEFAULT 0,
    "scout_received_count" INTEGER NOT NULL DEFAULT 0,
    "response_count" INTEGER NOT NULL DEFAULT 0,
    "response_eligible_count" INTEGER NOT NULL DEFAULT 0,
    "average_response_seconds" BIGINT,
    "manner_temperature" DECIMAL NOT NULL DEFAULT 36.5,
    "manner_evaluation_count" INTEGER NOT NULL DEFAULT 0,
    "manner_formula_version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "user_scout_stats_counts_check" CHECK (
        "scout_sent_count" >= 0
        AND "scout_received_count" >= 0
        AND "response_count" >= 0
        AND "response_eligible_count" >= 0
        AND "response_count" <= "response_eligible_count"
        AND ("average_response_seconds" IS NULL OR "average_response_seconds" >= 0)
        AND "manner_temperature" BETWEEN 0 AND 99.9
        AND "manner_evaluation_count" >= 0
        AND "manner_formula_version" >= 1
    ),
    CONSTRAINT "user_scout_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" TEXT NOT NULL,
    "blocked_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_participants_check" CHECK ("blocker_id" <> "blocked_id"),
    PRIMARY KEY ("blocker_id", "blocked_id"),
    CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reporter_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" DATETIME,
    CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_auth_subject_key" ON "users"("auth_provider", "auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_handle_key" ON "user_profiles"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_handle_ci_key" ON "user_profiles"(lower("handle")) WHERE "handle" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "role_groups_name_key" ON "role_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "role_groups_slug_key" ON "role_groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE INDEX "roles_group_id_is_active_sort_order_idx" ON "roles"("group_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "roles_group_id_name_key" ON "roles"("group_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_priority_key" ON "user_roles"("user_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE INDEX "assets_owner_id_kind_created_at_idx" ON "assets"("owner_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_replacement_pdf_asset_id_key" ON "portfolios"("replacement_pdf_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "portfolios_replacement_video_asset_id_key" ON "portfolios"("replacement_video_asset_id");

-- CreateIndex
CREATE INDEX "portfolios_status_published_at_idx" ON "portfolios"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "portfolios_author_id_status_published_at_idx" ON "portfolios"("author_id", "status", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_pages_portfolio_id_page_number_key" ON "portfolio_pages"("portfolio_id", "page_number");

-- CreateIndex
CREATE INDEX "portfolio_roles_role_id_portfolio_id_idx" ON "portfolio_roles"("role_id", "portfolio_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_normalized_name_key" ON "tags"("normalized_name");

-- CreateIndex
CREATE INDEX "portfolio_tags_tag_id_portfolio_id_idx" ON "portfolio_tags"("tag_id", "portfolio_id");

-- CreateIndex
CREATE INDEX "scout_requests_recipient_id_status_created_at_idx" ON "scout_requests"("recipient_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scout_requests_sender_id_status_created_at_idx" ON "scout_requests"("sender_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scout_requests_recipient_id_recipient_read_at_idx" ON "scout_requests"("recipient_id", "recipient_read_at");

-- CreateIndex
CREATE INDEX "scout_requests_sender_id_sender_read_at_idx" ON "scout_requests"("sender_id", "sender_read_at");

-- CreateIndex
CREATE UNIQUE INDEX "scout_requests_pending_unique" ON "scout_requests"("sender_id", "recipient_id", "source_portfolio_id") WHERE "status" = 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_scout_request_id_key" ON "chat_rooms"("scout_request_id");

-- CreateIndex
CREATE INDEX "chat_messages_room_id_created_at_id_idx" ON "chat_messages"("room_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_sender_id_client_message_id_key" ON "chat_messages"("sender_id", "client_message_id");

-- CreateIndex
CREATE INDEX "manner_feedback_to_user_id_created_at_idx" ON "manner_feedback"("to_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "manner_feedback_scout_request_id_from_user_id_key" ON "manner_feedback"("scout_request_id", "from_user_id");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_created_at_idx" ON "reports"("target_type", "target_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- Taxonomy is release data, so it ships with the migration instead of a per-deploy seed job.
INSERT INTO "role_groups" ("id", "name", "slug", "sort_order", "is_active")
SELECT 'group:' || "group_slug", "group_name", "group_slug", MIN("group_sort_order"), 1
FROM "discovery_roles"
GROUP BY "group_slug", "group_name";

INSERT INTO "roles" ("id", "group_id", "name", "slug", "sort_order", "is_active")
SELECT 'role:' || "slug", 'group:' || "group_slug", "name", "slug", "sort_order", "is_active"
FROM "discovery_roles";
