-- ============================================================================
-- Migration: Approval Workflow v2
-- Description: GitHub PR-style approval system with custom groups
-- ============================================================================

-- ============================================================================
-- 1. Approval Groups (Custom-defined approval groups per document)
-- ============================================================================

CREATE TABLE approval_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_approvals INTEGER NOT NULL DEFAULT 1 CHECK (min_approvals >= 1),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure unique sort order per document
    UNIQUE(document_id, sort_order)
);

CREATE INDEX idx_approval_groups_document ON approval_groups(document_id);

COMMENT ON TABLE approval_groups IS 'Custom approval groups defined per document';
COMMENT ON COLUMN approval_groups.min_approvals IS 'Number of approvals required from this group (default: 1 = any member can approve)';

-- ============================================================================
-- 2. Group Members (Users assigned to approval groups)
-- ============================================================================

CREATE TABLE approval_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES approval_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON approval_group_members(group_id);
CREATE INDEX idx_group_members_user ON approval_group_members(user_id);

-- ============================================================================
-- 3. Proposal Status Enum (extends existing proposals table)
-- ============================================================================

-- First, check what columns exist in proposals table
DO $$
BEGIN
    -- Add status column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'status') THEN
        ALTER TABLE proposals ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
    END IF;
    
    -- Add commit hash tracking if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'target_commit_hash') THEN
        ALTER TABLE proposals ADD COLUMN target_commit_hash TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'source_commit_hash') THEN
        ALTER TABLE proposals ADD COLUMN source_commit_hash TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'merged_at') THEN
        ALTER TABLE proposals ADD COLUMN merged_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'merged_by') THEN
        ALTER TABLE proposals ADD COLUMN merged_by UUID REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'proposals' AND column_name = 'merge_commit_hash') THEN
        ALTER TABLE proposals ADD COLUMN merge_commit_hash TEXT;
    END IF;
END $$;

-- Proposal status check constraint: drop both the original inline constraint and
-- any prior named constraint, then add a unified superset constraint.
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS check_proposal_status;
ALTER TABLE proposals ADD CONSTRAINT check_proposal_status
    CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'MERGED', 'REJECTED',
                      'open', 'approved', 'changes_requested', 'rejected', 'merged', 'closed'));

-- ============================================================================
-- 4. Proposal Approvals (Version-specific approvals)
-- ============================================================================

CREATE TABLE proposal_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    group_id UUID REFERENCES approval_groups(id) ON DELETE SET NULL,
    approved_by UUID NOT NULL REFERENCES users(id),
    commit_hash TEXT NOT NULL,  -- The specific version being approved
    status TEXT NOT NULL CHECK (status IN ('approved', 'rejected', 'dismissed')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One approval per person per proposal
    UNIQUE(proposal_id, approved_by)
);

CREATE INDEX idx_proposal_approvals_proposal ON proposal_approvals(proposal_id);
CREATE INDEX idx_proposal_approvals_group ON proposal_approvals(group_id);
CREATE INDEX idx_proposal_approvals_user ON proposal_approvals(approved_by);

COMMENT ON TABLE proposal_approvals IS 'Individual approval/rejection actions on proposals';
COMMENT ON COLUMN proposal_approvals.commit_hash IS 'The commit hash that was approved - used to detect stale approvals';

-- ============================================================================
-- 5. Review Comments (Line-level comments on proposals)
-- ============================================================================

CREATE TABLE proposal_review_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    author UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    
    -- Optional: file-specific comment
    file_path TEXT,
    line_number INTEGER,
    commit_hash TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_comments_proposal ON proposal_review_comments(proposal_id);

-- ============================================================================
-- 6. Trigger: Auto-update timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_approval_groups_updated_at
    BEFORE UPDATE ON approval_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposal_review_comments_updated_at
    BEFORE UPDATE ON proposal_review_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. View: Proposal with Approval Status
-- ============================================================================

CREATE OR REPLACE VIEW proposal_approval_status AS
SELECT 
    p.id AS proposal_id,
    p.document_id,
    p.status AS proposal_status,
    p.source_commit_hash,
    p.target_commit_hash,
    ag.id AS group_id,
    ag.name AS group_name,
    ag.min_approvals,
    ag.sort_order,
    COUNT(pa.id) FILTER (WHERE pa.status = 'approved') AS approval_count,
    BOOL_OR(pa.commit_hash = p.source_commit_hash) FILTER (WHERE pa.status = 'approved') AS has_current_approval,
    CASE 
        WHEN COUNT(pa.id) FILTER (WHERE pa.status = 'approved') >= ag.min_approvals 
        THEN 'approved'
        WHEN COUNT(pa.id) FILTER (WHERE pa.status = 'rejected') > 0 
        THEN 'rejected'
        ELSE 'pending'
    END AS group_status
FROM proposals p
JOIN approval_groups ag ON ag.document_id = p.document_id
LEFT JOIN proposal_approvals pa ON pa.proposal_id = p.id AND pa.group_id = ag.id
WHERE p.status IN ('open', 'approved', 'changes_requested')
GROUP BY p.id, p.document_id, p.status, p.source_commit_hash, p.target_commit_hash, ag.id, ag.name, ag.min_approvals, ag.sort_order;

COMMENT ON VIEW proposal_approval_status IS 'Computed approval status per group per proposal';
