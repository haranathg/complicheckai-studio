-- Add missing columns to chat_messages table
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS document_sources JSON;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS model VARCHAR(100);
