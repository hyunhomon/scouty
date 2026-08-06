-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "scout_status" AS ENUM ('open', 'selective', 'closed');

-- CreateEnum
CREATE TYPE "asset_kind" AS ENUM ('avatar', 'portfolio_pdf', 'portfolio_page', 'portfolio_thumbnail', 'portfolio_video', 'chat_image');

-- CreateEnum
CREATE TYPE "asset_status" AS ENUM ('uploading', 'ready', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "portfolio_status" AS ENUM ('draft', 'processing', 'published', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "scout_request_status" AS ENUM ('pending', 'accepted', 'declined', 'canceled');

-- CreateEnum
CREATE TYPE "chat_message_type" AS ENUM ('text', 'image', 'system');

-- CreateEnum
CREATE TYPE "manner_sentiment" AS ENUM ('positive', 'negative');

-- CreateEnum
CREATE TYPE "report_target_type" AS ENUM ('user', 'portfolio', 'scout_request', 'message');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('scout_request_received', 'scout_request_accepted', 'scout_request_declined', 'chat_message_received', 'manner_feedback_available', 'portfolio_processing_completed', 'portfolio_processing_failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_provider" VARCHAR(32) NOT NULL,
    "auth_subject" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "avatar_asset_id" UUID,
    "nickname" VARCHAR(20),
    "handle" VARCHAR(20),
    "bio" VARCHAR(160),
    "communication_preference" VARCHAR(60),
    "scout_status" "scout_status" NOT NULL DEFAULT 'selective',
    "profile_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "role_groups" (
    "id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "slug" VARCHAR(40) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "priority" SMALLINT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "asset_kind" NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(127) NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "status" "asset_status" NOT NULL DEFAULT 'uploading',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "pdf_asset_id" UUID NOT NULL,
    "video_asset_id" UUID,
    "page_count" INTEGER,
    "cover_page" INTEGER NOT NULL DEFAULT 1,
    "status" "portfolio_status" NOT NULL DEFAULT 'draft',
    "processing_error_code" VARCHAR(80),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_pages" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "image_asset_id" UUID NOT NULL,
    "thumbnail_asset_id" UUID NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "portfolio_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_roles" (
    "portfolio_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "portfolio_roles_pkey" PRIMARY KEY ("portfolio_id","role_id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "normalized_name" VARCHAR(20) NOT NULL,
    "usage_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_tags" (
    "portfolio_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "portfolio_tags_pkey" PRIMARY KEY ("portfolio_id","tag_id")
);

-- CreateTable
CREATE TABLE "portfolio_bookmarks" (
    "user_id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_bookmarks_pkey" PRIMARY KEY ("user_id","portfolio_id")
);

-- CreateTable
CREATE TABLE "scout_requests" (
    "id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "source_portfolio_id" UUID NOT NULL,
    "source_portfolio_title_snapshot" VARCHAR(60) NOT NULL,
    "requested_role_id" UUID NOT NULL,
    "project_title" VARCHAR(80) NOT NULL,
    "project_summary" VARCHAR(160) NOT NULL,
    "estimated_period_text" VARCHAR(60) NOT NULL,
    "weekly_commitment_text" VARCHAR(60) NOT NULL,
    "team_composition_text" VARCHAR(120) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "status" "scout_request_status" NOT NULL DEFAULT 'pending',
    "responded_at" TIMESTAMPTZ(3),
    "canceled_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" UUID NOT NULL,
    "scout_request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "sender_id" UUID,
    "client_message_id" UUID,
    "type" "chat_message_type" NOT NULL,
    "body" TEXT,
    "asset_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_read_states" (
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_message_id" UUID,
    "read_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "chat_read_states_pkey" PRIMARY KEY ("room_id","user_id")
);

-- CreateTable
CREATE TABLE "manner_feedback" (
    "id" UUID NOT NULL,
    "scout_request_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "sentiment" "manner_sentiment" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manner_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_scout_stats" (
    "user_id" UUID NOT NULL,
    "scout_sent_count" INTEGER NOT NULL DEFAULT 0,
    "scout_received_count" INTEGER NOT NULL DEFAULT 0,
    "response_count" INTEGER NOT NULL DEFAULT 0,
    "response_eligible_count" INTEGER NOT NULL DEFAULT 0,
    "average_response_seconds" BIGINT,
    "manner_temperature" DECIMAL(4,1) NOT NULL DEFAULT 36.5,
    "manner_evaluation_count" INTEGER NOT NULL DEFAULT 0,
    "manner_formula_version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_scout_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "report_target_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason_code" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_auth_subject_key" ON "users"("auth_provider", "auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_handle_key" ON "user_profiles"("handle");

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

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_avatar_asset_id_fkey" FOREIGN KEY ("avatar_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "role_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_pdf_asset_id_fkey" FOREIGN KEY ("pdf_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_video_asset_id_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_pages" ADD CONSTRAINT "portfolio_pages_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_pages" ADD CONSTRAINT "portfolio_pages_image_asset_id_fkey" FOREIGN KEY ("image_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_pages" ADD CONSTRAINT "portfolio_pages_thumbnail_asset_id_fkey" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_roles" ADD CONSTRAINT "portfolio_roles_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_roles" ADD CONSTRAINT "portfolio_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_tags" ADD CONSTRAINT "portfolio_tags_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_tags" ADD CONSTRAINT "portfolio_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_bookmarks" ADD CONSTRAINT "portfolio_bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_bookmarks" ADD CONSTRAINT "portfolio_bookmarks_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scout_requests" ADD CONSTRAINT "scout_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scout_requests" ADD CONSTRAINT "scout_requests_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scout_requests" ADD CONSTRAINT "scout_requests_source_portfolio_id_fkey" FOREIGN KEY ("source_portfolio_id") REFERENCES "portfolios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scout_requests" ADD CONSTRAINT "scout_requests_requested_role_id_fkey" FOREIGN KEY ("requested_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_scout_request_id_fkey" FOREIGN KEY ("scout_request_id") REFERENCES "scout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_last_read_message_id_fkey" FOREIGN KEY ("last_read_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manner_feedback" ADD CONSTRAINT "manner_feedback_scout_request_id_fkey" FOREIGN KEY ("scout_request_id") REFERENCES "scout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manner_feedback" ADD CONSTRAINT "manner_feedback_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manner_feedback" ADD CONSTRAINT "manner_feedback_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scout_stats" ADD CONSTRAINT "user_scout_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain constraints that Prisma's schema language cannot express.
ALTER TABLE "role_groups"
  ADD CONSTRAINT "role_groups_sort_order_check" CHECK ("sort_order" > 0);

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_sort_order_check" CHECK ("sort_order" > 0);

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_priority_check" CHECK ("priority" BETWEEN 1 AND 3);

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_dimensions_check" CHECK (
    "byte_size" >= 0
    AND ("width" IS NULL OR "width" > 0)
    AND ("height" IS NULL OR "height" > 0)
    AND ("duration_seconds" IS NULL OR "duration_seconds" > 0)
  );

ALTER TABLE "portfolios"
  ADD CONSTRAINT "portfolios_page_bounds_check" CHECK (
    ("page_count" IS NULL OR "page_count" BETWEEN 1 AND 50)
    AND "cover_page" >= 1
    AND ("page_count" IS NULL OR "cover_page" <= "page_count")
  ),
  ADD CONSTRAINT "portfolios_published_at_check" CHECK (
    "status" <> 'published' OR "published_at" IS NOT NULL
  );

ALTER TABLE "portfolio_pages"
  ADD CONSTRAINT "portfolio_pages_geometry_check" CHECK (
    "page_number" >= 1 AND "width" > 0 AND "height" > 0
  );

ALTER TABLE "tags"
  ADD CONSTRAINT "tags_usage_count_check" CHECK ("usage_count" >= 0);

ALTER TABLE "scout_requests"
  ADD CONSTRAINT "scout_requests_participants_check" CHECK ("sender_id" <> "recipient_id");

CREATE UNIQUE INDEX "scout_requests_pending_unique"
  ON "scout_requests" ("sender_id", "recipient_id", "source_portfolio_id")
  WHERE "status" = 'pending';

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_payload_check" CHECK (
    ("type" = 'text' AND "body" IS NOT NULL AND length(trim("body")) > 0)
    OR ("type" = 'image' AND "asset_id" IS NOT NULL)
    OR ("type" = 'system' AND "body" IS NOT NULL AND length(trim("body")) > 0)
  );

ALTER TABLE "manner_feedback"
  ADD CONSTRAINT "manner_feedback_participants_check" CHECK ("from_user_id" <> "to_user_id");

ALTER TABLE "user_scout_stats"
  ADD CONSTRAINT "user_scout_stats_counts_check" CHECK (
    "scout_sent_count" >= 0
    AND "scout_received_count" >= 0
    AND "response_count" >= 0
    AND "response_eligible_count" >= 0
    AND "response_count" <= "response_eligible_count"
    AND ("average_response_seconds" IS NULL OR "average_response_seconds" >= 0)
    AND "manner_temperature" BETWEEN 0 AND 99.9
    AND "manner_evaluation_count" >= 0
    AND "manner_formula_version" >= 1
  );

ALTER TABLE "user_blocks"
  ADD CONSTRAINT "user_blocks_participants_check" CHECK ("blocker_id" <> "blocked_id");
