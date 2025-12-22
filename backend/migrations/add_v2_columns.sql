-- Migration: Add V2 compliance check columns
-- Run this against the NeonDB database to add missing columns

-- Add document classification columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_confidence INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_signals JSON;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_override BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_model VARCHAR(100);

-- Create index on document_type
CREATE INDEX IF NOT EXISTS ix_documents_document_type ON documents(document_type);

-- Create project_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS project_settings (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    work_type VARCHAR(50) DEFAULT 'custom',
    vision_parser VARCHAR(50) DEFAULT 'landing_ai',
    vision_model VARCHAR(100),
    chat_model VARCHAR(100) DEFAULT 'bedrock-claude-sonnet-3.5',
    compliance_model VARCHAR(100) DEFAULT 'bedrock-claude-sonnet-3.5',
    checks_config JSON,
    total_parse_credits INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create batch_check_runs table if it doesn't exist
CREATE TABLE IF NOT EXISTS batch_check_runs (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending',
    total_documents INTEGER DEFAULT 0,
    completed_documents INTEGER DEFAULT 0,
    failed_documents INTEGER DEFAULT 0,
    skipped_documents INTEGER DEFAULT 0,
    model VARCHAR(100),
    force_rerun BOOLEAN DEFAULT FALSE,
    total_passed INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_needs_review INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_batch_check_runs_project_id ON batch_check_runs(project_id);
CREATE INDEX IF NOT EXISTS ix_batch_check_runs_status ON batch_check_runs(status);

-- Create check_results table if it doesn't exist
CREATE TABLE IF NOT EXISTS check_results (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parse_result_id VARCHAR(36) REFERENCES parse_results(id) ON DELETE SET NULL,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    batch_run_id VARCHAR(36) REFERENCES batch_check_runs(id) ON DELETE SET NULL,
    run_number INTEGER DEFAULT 1,
    document_type VARCHAR(50),
    completeness_results JSON,
    compliance_results JSON,
    summary JSON,
    checks_config_snapshot JSON,
    model VARCHAR(100),
    input_tokens INTEGER,
    output_tokens INTEGER,
    status VARCHAR(20) DEFAULT 'completed',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER
);

CREATE INDEX IF NOT EXISTS ix_check_results_document_id ON check_results(document_id);
CREATE INDEX IF NOT EXISTS ix_check_results_project_id ON check_results(project_id);
CREATE INDEX IF NOT EXISTS ix_check_results_batch_run_id ON check_results(batch_run_id);
CREATE INDEX IF NOT EXISTS ix_check_results_created_at ON check_results(created_at);
