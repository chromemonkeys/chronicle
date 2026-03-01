-- ============================================================================
-- Migration: Approval Workflow v2 (Rollback)
-- ============================================================================

DROP VIEW IF EXISTS proposal_approval_status;

DROP TABLE IF EXISTS proposal_review_comments;
DROP TABLE IF EXISTS proposal_approvals;
DROP TABLE IF EXISTS approval_group_members;
DROP TABLE IF EXISTS approval_groups;

-- Remove columns added to proposals table
ALTER TABLE proposals DROP COLUMN IF EXISTS status;
ALTER TABLE proposals DROP COLUMN IF EXISTS target_commit_hash;
ALTER TABLE proposals DROP COLUMN IF EXISTS source_commit_hash;
ALTER TABLE proposals DROP COLUMN IF EXISTS merged_at;
ALTER TABLE proposals DROP COLUMN IF EXISTS merged_by;
ALTER TABLE proposals DROP COLUMN IF EXISTS merge_commit_hash;

DROP TRIGGER IF EXISTS update_approval_groups_updated_at ON approval_groups;
DROP TRIGGER IF EXISTS update_proposal_review_comments_updated_at ON proposal_review_comments;
