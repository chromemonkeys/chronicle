# Approval Workflow v2 Design

## Overview
Replace the rigid 3-role approval system with a flexible, GitHub PR-style approval workflow.

## Current Problems
1. **Rigid roles**: Only security/architecture/legal - users can't define custom groups
2. **No org integration**: Reviewers added by email, not looked up from organization
3. **No version tracking**: Approvals aren't tied to specific document versions/commits
4. **No commit semantics**: Changes after approval don't invalidate the approval
5. **Permission ambiguity**: Unclear how reviewers without doc access can approve

## New Design

### Core Concepts

```
Document State Flow:
┌─────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐
│  DRAFT  │ → │ IN_REVIEW  │ → │ APPROVED │ → │ MERGED   │
└─────────┘   └────────────┘   └──────────┘   └──────────┘
                    ↓
              ┌────────────┐
              │  CHANGES   │ ← New commits need re-approval
              │  REQUESTED │
              └────────────┘
```

### 1. Custom Approval Groups

Users define custom approval groups per document:

```typescript
interface ApprovalGroup {
  id: string;
  documentId: string;
  name: string;           // e.g., "Security Team", "Legal Review"
  description: string;
  minApprovals: number;   // Default: 1 (any member can approve)
  members: GroupMember[];
  order: number;          // Sequential order in workflow
}

interface GroupMember {
  userId: string;
  userName: string;
  userEmail: string;
  addedAt: string;
}
```

### 2. Proposals (Pull Requests)

A Proposal represents a request to merge changes:

```typescript
interface Proposal {
  id: string;
  documentId: string;
  branchName: string;           // e.g., "proposal-abc-123"
  targetVersion: string;        // Git commit hash to merge INTO
  sourceVersion: string;        // Git commit hash merging FROM
  title: string;
  description: string;
  status: "open" | "approved" | "rejected" | "merged" | "closed";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  mergedBy?: string;
}
```

### 3. Version-Specific Approvals

Approvals are tied to specific commits:

```typescript
interface Approval {
  id: string;
  proposalId: string;
  groupId: string;
  approvedBy: string;
  approvedAt: string;
  commitHash: string;           // The version being approved
  status: "approved" | "rejected" | "dismissed";
  comment?: string;
}
```

### 4. Commit-Based Invalidation

If new commits are pushed to a proposal, previous approvals are marked as "stale":

```typescript
// Logic: When new commit pushed
if (proposal.status === "approved" && newCommitHash !== lastApprovedCommit) {
  // Mark all approvals for this proposal as "stale"
  // Proposal status → "changes_requested" (needs re-approval)
}
```

### 5. Permission Model

Reviewers get temporary access via proposal context:

```typescript
// Permission check for reviewer
canReview(proposalId, userId) {
  const proposal = getProposal(proposalId);
  const isReviewer = proposal.groups.some(g => 
    g.members.some(m => m.userId === userId)
  );
  
  // Reviewers can see the proposal and diff, even without doc access
  return isReviewer && proposal.status === "open";
}
```

## API Endpoints

### Approval Groups
```
GET    /api/documents/{id}/approval-groups
POST   /api/documents/{id}/approval-groups
PUT    /api/documents/{id}/approval-groups/{groupId}
DELETE /api/documents/{id}/approval-groups/{groupId}

// Members
POST   /api/documents/{id}/approval-groups/{groupId}/members
DELETE /api/documents/{id}/approval-groups/{groupId}/members/{userId}
```

### Proposals
```
GET    /api/documents/{id}/proposals
POST   /api/documents/{id}/proposals           // Create PR
GET    /api/proposals/{proposalId}
POST   /api/proposals/{proposalId}/approve     // Approve current version
POST   /api/proposals/{proposalId}/reject
POST   /api/proposals/{proposalId}/merge
POST   /api/proposals/{proposalId}/close
```

### User Lookup
```
GET /api/workspaces/{id}/users?search={query}  // Search org users
```

## UI Components

### 1. Approval Groups Manager
- Create/edit custom groups
- Add members from org user search
- Set minimum approvals required
- Reorder groups (sequential workflow)

### 2. Proposal Creation Flow
- "Create Proposal" button in document
- Title/description form
- Shows diff of changes
- Auto-assigns reviewers based on groups

### 3. Approval Status Panel
- Shows all groups and their status
- Green checkmark = approved by someone in group
- Red X = rejected
- Yellow clock = pending
- "Stale" badge if new commits since approval

### 4. Review Interface
- Side-by-side diff view
- Comment on specific lines
- Approve/Reject with comment
- View approval history

## Database Schema Changes

```sql
-- Approval Groups
CREATE TABLE approval_groups (
    id UUID PRIMARY KEY,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    min_approvals INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group Members
CREATE TABLE approval_group_members (
    id UUID PRIMARY KEY,
    group_id UUID REFERENCES approval_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    added_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- Proposals (extends existing proposals table)
ALTER TABLE proposals ADD COLUMN target_commit_hash TEXT;
ALTER TABLE proposals ADD COLUMN source_commit_hash TEXT;
ALTER TABLE proposals ADD COLUMN status TEXT DEFAULT 'open';

-- Approvals (version-specific)
CREATE TABLE proposal_approvals (
    id UUID PRIMARY KEY,
    proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
    group_id UUID REFERENCES approval_groups(id),
    approved_by UUID REFERENCES users(id),
    commit_hash TEXT NOT NULL,  -- The version being approved
    status TEXT NOT NULL,       -- approved, rejected, dismissed
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(proposal_id, group_id, approved_by)  -- One approval per person per group
);
```

## Migration Strategy

1. **Phase 1**: Create new tables, keep old system running
2. **Phase 2**: Migrate existing 3-role approvals to new groups
3. **Phase 3**: Update UI to use new system
4. **Phase 4**: Deprecate old approval columns

## Key Improvements

1. ✅ **Custom groups**: Users define any approval groups they need
2. ✅ **Org user lookup**: Members added from workspace user search
3. ✅ **Version-specific**: Approvals tied to commit hashes
4. ✅ **Commit semantics**: New commits invalidate stale approvals
5. ✅ **Clear permissions**: Reviewers get proposal-scoped access
6. ✅ **PR workflow**: Familiar GitHub-style experience
