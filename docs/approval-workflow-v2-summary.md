# Approval Workflow v2 - Implementation Summary

## Overview
Implemented a GitHub PR-style approval workflow system to replace the rigid 3-role (security/architecture/legal) approval system.

## Key Features

### 1. Custom Approval Groups
- Users can create any number of approval groups per document
- Groups are sequential (reviewed in order)
- Each group has:
  - Name and description
  - Minimum approvals required (default: 1)
  - Members from workspace user directory
  - Sort order (drag to reorder)

### 2. Version-Specific Approvals
- Approvals are tied to specific Git commit hashes
- When new commits are pushed, previous approvals become "stale"
- Stale approvals require re-review

### 3. Proposal-Based Workflow
- Changes are submitted as Proposals (like PRs)
- Proposals track:
  - Source commit (feature branch)
  - Target commit (main branch)
  - Approval status per group
  - Merge state

### 4. Permission Model
- Reviewers get proposal-scoped access
- Can view diff and approve even without document access
- Access granted via approval group membership

## Files Created/Modified

### Database
- `db/migrations/0009_approval_workflow_v2.up.sql` - New tables and views
- `db/migrations/0009_approval_workflow_v2.down.sql` - Rollback

### Types
- `src/api/types-approval-v2.ts` - New TypeScript types

### API Client
- `src/api/approval-client.ts` - API methods for new workflow

### UI Components
- `src/components/ApprovalGroupsManager.tsx` - Configure custom groups
- `src/components/ProposalCard.tsx` - PR-style proposal display
- `src/components/DocumentSettingsDialog.tsx` - Updated to use new system

### Bug Fix
- `api/internal/app/service.go` - Added missing interface methods

## Migration Path

1. **Phase 1** (Current): New system runs alongside old system
2. **Phase 2**: Migrate existing 3-role approvals to new groups
3. **Phase 3**: Deprecate old approval columns

## Remaining Work

### Backend API Endpoints (Not Implemented)
The following endpoints need Go backend implementation:

```
GET    /api/documents/{id}/approval-groups
POST   /api/documents/{id}/approval-groups
PUT    /api/documents/{id}/approval-groups/{groupId}
DELETE /api/documents/{id}/approval-groups/{groupId}
POST   /api/documents/{id}/approval-groups/{groupId}/members
DELETE /api/documents/{id}/approval-groups/{groupId}/members/{userId}

GET    /api/workspaces/{id}/users

GET    /api/documents/{id}/proposals
POST   /api/documents/{id}/proposals
GET    /api/proposals/{proposalId}
POST   /api/proposals/{proposalId}/approve
POST   /api/proposals/{proposalId}/merge
POST   /api/proposals/{proposalId}/close
GET    /api/proposals/{proposalId}/diff
GET    /api/proposals/{proposalId}/group-status
GET    /api/approvals/queue
```

### UI Integration
- Replace old approval flow in document workspace
- Add "Create Proposal" button
- Show proposal list in document sidebar
- Integrate with merge gate badge

## How It Works

### Setting Up Approvals
1. Open Document Settings → Reviewers tab
2. Click "Add Group" to create custom groups (e.g., "Legal Review", "Security Team")
3. Search and add members from workspace
4. Set minimum approvals per group
5. Reorder groups if needed (sequential workflow)

### Creating a Proposal
1. Make changes to document
2. Click "Create Proposal" (like GitHub PR)
3. Add title and description
4. System auto-assigns reviewers based on groups

### Approving
1. Reviewers see proposal in queue
2. Can view diff of changes
3. Click "Approve" or "Request Changes"
4. Approval is tied to specific commit
5. If new commits pushed, approval becomes stale

### Merging
1. All groups must approve
2. No conflicts
3. Click "Merge" to apply changes
4. Document updated, proposal closed

## User-Facing Improvements

| Before | After |
|--------|-------|
| 3 rigid roles | Unlimited custom groups |
| Email-based reviewers | Org user lookup |
| No version tracking | Commit-specific approvals |
| Changes after approval allowed | Stale approval detection |
| Unclear permissions | Proposal-scoped access |

## Technical Notes

- Uses existing `proposals` table with new columns
- New tables: `approval_groups`, `approval_group_members`, `proposal_approvals`
- View `proposal_approval_status` for efficient status queries
- Backward compatible with old system during migration
