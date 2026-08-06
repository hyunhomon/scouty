-- Keep the active published media intact while a replacement is uploaded and processed.
CREATE TYPE "portfolio_replacement_status" AS ENUM ('uploading', 'processing', 'failed');

ALTER TABLE "portfolios"
ADD COLUMN "replacement_pdf_asset_id" UUID,
ADD COLUMN "replacement_video_asset_id" UUID,
ADD COLUMN "replacement_status" "portfolio_replacement_status",
ADD COLUMN "replacement_error_code" VARCHAR(80),
ADD COLUMN "video_processing_error_code" VARCHAR(80);

CREATE UNIQUE INDEX "portfolios_replacement_pdf_asset_id_key"
ON "portfolios"("replacement_pdf_asset_id");

CREATE UNIQUE INDEX "portfolios_replacement_video_asset_id_key"
ON "portfolios"("replacement_video_asset_id");

ALTER TABLE "portfolios"
ADD CONSTRAINT "portfolios_replacement_pdf_asset_id_fkey"
FOREIGN KEY ("replacement_pdf_asset_id") REFERENCES "assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "portfolios"
ADD CONSTRAINT "portfolios_replacement_video_asset_id_fkey"
FOREIGN KEY ("replacement_video_asset_id") REFERENCES "assets"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
