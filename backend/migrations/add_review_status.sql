-- Migration: Add review_status column to documents table
-- Run this against the NeonDB database

ALTER TABLE documents ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'not_reviewed';
