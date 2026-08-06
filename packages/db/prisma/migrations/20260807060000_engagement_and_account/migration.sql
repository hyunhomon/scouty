-- Track request read state per participant and account deletion time.
ALTER TABLE "users"
ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

ALTER TABLE "assets"
ADD COLUMN "purged_at" TIMESTAMPTZ(3);

ALTER TABLE "scout_requests"
ADD COLUMN "sender_read_at" TIMESTAMPTZ(3),
ADD COLUMN "recipient_read_at" TIMESTAMPTZ(3);

-- Existing senders have already seen the requests they created.
UPDATE "scout_requests"
SET "sender_read_at" = "created_at";

CREATE INDEX "scout_requests_recipient_id_recipient_read_at_idx"
ON "scout_requests"("recipient_id", "recipient_read_at");

CREATE INDEX "scout_requests_sender_id_sender_read_at_idx"
ON "scout_requests"("sender_id", "sender_read_at");
