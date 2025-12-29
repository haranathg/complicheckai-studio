-- Migration: Extend status column length for batch_jobs and batch_check_runs
-- Required to support 'completed_with_errors' status (21 chars)
-- Current column is varchar(20), needs to be varchar(30)

-- Extend batch_jobs.status column
ALTER TABLE batch_jobs ALTER COLUMN status TYPE VARCHAR(30);

-- Also extend batch_check_runs.status column for consistency
ALTER TABLE batch_check_runs ALTER COLUMN status TYPE VARCHAR(30);
