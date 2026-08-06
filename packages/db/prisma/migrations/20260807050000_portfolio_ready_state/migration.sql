-- Add an explicit private state between media processing and publication.
ALTER TYPE "portfolio_status" ADD VALUE 'ready' AFTER 'processing';
