#!/bin/bash
# Create GitHub issues for Role & User Management System
# Usage: ./scripts/create-permission-tickets.sh
# Requires: gh CLI authenticated

set -e

EPIC="76"
REPO="."  # Current repo

echo "Creating GitHub issues for Role & User Management System (Epic #${EPIC})..."
echo ""

# Check if gh is authenticated
if ! gh auth status &>/dev/null; then
    echo "Error: GitHub CLI not authenticated. Run 'gh auth login' first."
    exit 1
fi

# Function to create issue
create_issue() {
    local title="$1"
    local body="$2"
    local labels="$3"
    
    gh issue create \
        --title "$title" \
        --body "$body" \
        --label "$labels" \
        --repo "$REPO"
}

# Ticket #101: Database Schema
create_issue "[M7.1] Database Schema for RBAC (#101)" "## Description
Create the database schema for role-based access control including users, groups, permissions, and public links tables with proper indexing and constraints.

## Acceptance Criteria
- [ ] Create \\\"users\\\" table with \\\"is_external\\\" flag and \\\"external_space_id\\\"
- [ ] Create \\\"groups\\\" and \\\"group_memberships\\\" tables
- [ ] Create \\\"permissions\\\" table with subject/resource polymorphism
- [ ] Create \\\"public_links\\\" table for shareable links
- [ ] Create \\\"mv_effective_permissions\\\" materialized view
- [ ] Add indexes on: users.workspace_id, users.email, permissions.resource_id, permissions.subject_id
- [ ] Add migration scripts with rollback
- [ ] Unit tests for schema migrations

## Technical Notes
- Use subject_type and resource_type enums for polymorphic associations
- Soft deletes via deleted_at on all tables
- UUID primary keys throughout

## Dependencies
None (foundational)

## Epic
Part of #${EPIC}" "backend,database,m7.1,p0"

# Ticket #102: Core Permission Service
create_issue "[M7.1] Core Permission Service Layer (#102)" "## Description
Implement the core permission service in Go with efficient permission checking, grant management, and caching.

## Acceptance Criteria
- [ ] PermissionService interface with methods:
  - CheckPermission(ctx, userID, resourceType, resourceID, action) (bool, error)
  - GrantPermission(ctx, grant) error
  - RevokePermission(ctx, grantID) error
  - ListPermissions(ctx, resourceType, resourceID) ([]Grant, error)
  - GetEffectivePermissions(ctx, userID) (PermissionSet, error)
- [ ] Materialized view refresh trigger on permission changes
- [ ] Redis caching layer for permission checks (5min TTL)
- [ ] \\\"Additive permissions\\\" logic (most permissive wins)
- [ ] Bulk permission operations for groups
- [ ] Comprehensive unit tests (>80% coverage)

## Technical Notes
- Cache key format: perm:{userID}:{resourceType}:{resourceID}:{action}
- Use Redis for session-level permission caching
- Implement cache invalidation on permission changes
- Handle recursive group membership resolution

## Dependencies
- #101 (Database Schema)

## Epic
Part of #${EPIC}" "backend,go,m7.1,p0"

# Ticket #103: Space Permissions UI
create_issue "[M7.2] Space Permissions UI (#103)" "## Description
Build the space permissions management screen where space admins can manage user, group, and guest access.

## Acceptance Criteria
- [ ] New \\\"Permissions\\\" tab in Space Settings
- [ ] Three sub-tabs: Users, Groups, Guests
- [ ] Users tab:
  - List users with current role
  - Add user by email with role selection
  - Change role dropdown
  - Remove user button
- [ ] Groups tab:
  - List groups with member count
  - Add group with role selection
  - Remove group
- [ ] Guests tab:
  - List guest users with email and role
  - Invite guest flow (email + role + optional expiry)
  - Visual \\\"GUEST\\\" badge on guest entries
  - Revoke guest access
- [ ] Real-time updates when permissions change
- [ ] Loading states and error handling
- [ ] Responsive design

## Dependencies
- #102 (Permission Service)

## Epic
Part of #${EPIC}" "frontend,react,ui,m7.2,p0"

# Ticket #104: Document Share Dialog
create_issue "[M7.2] Document Share Dialog (#104)" "## Description
Implement the document sharing dialog for managing access modes and inviting users.

## Acceptance Criteria
- [ ] Share button in document header (visible to editors/admins)
- [ ] Dialog with four access mode radio buttons:
  - Private (owner only)
  - Space Members (inherit from space)
  - Invite Only (named individuals)
  - Anyone with the link
- [ ] For \\\"Invite Only\\\":
  - People list with add/remove
  - Role selector per person
  - Email input with autocomplete
- [ ] For \\\"Anyone with the link\\\":
  - Toggle between Viewer/Commenter
  - Optional password protection
  - Optional expiry date picker
  - Copy link button
  - Regenerate link option
- [ ] Permission summary showing who can access
- [ ] Toast notifications for actions

## Dependencies
- #102 (Permission Service)

## Epic
Part of #${EPIC}" "frontend,react,ui,m7.2,p0"

# Ticket #105: Guest User Management
create_issue "[M7.3] Guest User Management (#105)" "## Description
Implement full guest user lifecycle: invitation, authentication, restricted access, and visibility controls.

## Acceptance Criteria
- [ ] Guest invitation flow:
  - Email invitation with signup link
  - Magic link authentication (no password needed)
  - Single-space scope enforced
- [ ] Guest restrictions:
  - Cannot access people directory
  - @Mentions limited to other guests in same space
  - Cannot see internal thread visibility option
  - Cannot create spaces or invite others
- [ ] UI indicators:
  - \\\"GUEST\\\" badge next to guest names
  - Warning banner in spaces with guest access
  - \\\"This thread is visible to external users\\\" warning
- [ ] Guest can:
  - View documents in assigned space
  - Comment on documents (if role allows)
  - Suggest changes (if role allows)
  - Participate in external threads
- [ ] Time-limited access with auto-expiry
- [ ] Email notifications to space admins on guest activity

## Technical Notes
- Guest users in same users table with is_external=true
- Separate auth flow for guests (magic link only)
- RLS policies enforce visibility restrictions

## Dependencies
- #101, #102, #103

## Epic
Part of #${EPIC}" "backend,frontend,auth,m7.3,p1"

# Ticket #106: Public Link Sharing
create_issue "[M7.3] Public Link Sharing (#106)" "## Description
Implement public link generation for document sharing without requiring login.

## Acceptance Criteria
- [ ] Generate secure random token for links
- [ ] Links format: /share/{token}
- [ ] Optional password protection (bcrypt)
- [ ] Optional expiry date (auto-revoke)
- [ ] Role selection: Viewer or Commenter
- [ ] Access analytics: view count, last accessed
- [ ] Revoke link functionality
- [ ] Link preview (OpenGraph meta tags)
- [ ] Audit log entry for each access

## API Contract
POST /api/documents/{id}/share-link
Body: { role, password?, expiresAt? }
Response: { token, url, role, expiresAt }

## Dependencies
- #101, #102

## Epic
Part of #${EPIC}" "backend,frontend,m7.3,p1"

# Ticket #107: Internal/External Thread Visibility
create_issue "[M7.3] Internal/External Thread Visibility (#107)" "## Description
Implement the critical security feature that separates internal team deliberation from external client communication.

## Acceptance Criteria
- [ ] Thread visibility column: INTERNAL (default) or EXTERNAL
- [ ] UI: Visibility toggle when creating/editing thread
  - \\\"Internal (team only)\\\" selected by default
  - \\\"External (visible to guests)\\\" with warning icon
- [ ] When external visibility selected:
  - Warning banner: \\\"This thread will be visible to external guests\\\"
  - Show which guests will see it
- [ ] External users:
  - Never see INTERNAL threads in API responses
  - Cannot be added to internal threads
  - Only see EXTERNAL threads they are mentioned in
- [ ] RLS policy enforcing visibility
- [ ] Sync Gateway filtering for external sessions
- [ ] Visual distinction in thread list (lock icon for internal)

## Security Requirements
RLS Policy: threads_visibility ON threads USING (visibility = 'EXTERNAL' OR current_setting('app.is_external')::bool = false)

## Dependencies
- #101, #105

## Epic
Part of #${EPIC}" "backend,frontend,security,m7.3,p0"

# Ticket #108: RLS Policy Implementation
create_issue "[M7.4] RLS Policy Implementation (#108)" "## Description
Implement PostgreSQL Row-Level Security policies to enforce permission rules at the database layer.

## Acceptance Criteria
- [ ] Enable RLS on all permission-sensitive tables:
  - documents, threads, annotations, branches, decision_log
- [ ] Create policies for each table:
  - Select: only if user has view permission
  - Insert: only if user has edit permission
  - Update: only if user has edit permission
  - Delete: only if user has admin permission
- [ ] Set application context on every DB connection:
  - app.current_user_id, app.is_external
- [ ] Test policies with external user simulation
- [ ] Document policy behavior

## Tables & Policies
| Table | Select | Insert | Update | Delete |
|-------|--------|--------|--------|--------|
| documents | Has view | Has edit | Has edit | Has admin |
| threads | Visibility rules | Has comment | Author only | Has admin |
| annotations | Has view | Has comment | Author only | Has admin |
| branches | Has view | Has edit | Has edit | Has admin |
| decision_log | Has view | System only | Denied | Denied |

## Dependencies
- #101, #102

## Epic
Part of #${EPIC}" "backend,database,security,m7.4,p0"

# Ticket #109: Permission Audit Logging
create_issue "[M7.4] Permission Audit Logging (#109)" "## Description
Log all permission changes to the audit log for compliance and security review.

## Acceptance Criteria
- [ ] Log events:
  - Permission granted (who, to whom, what, role)
  - Permission revoked
  - Public link created/revoked
  - Guest invited/removed
  - Role changed
- [ ] Audit log entry includes:
  - Actor (who made the change)
  - Subject (who was affected)
  - Resource (what was affected)
  - Previous value (for changes)
  - New value
  - Timestamp, IP address
- [ ] Export API for audit logs (admin only)
- [ ] UI: Simple audit view in space settings

## Dependencies
- #102

## Epic
Part of #${EPIC}" "backend,security,m7.4,p1"

# Ticket #110: Group Management
create_issue "[M7.5] Group Management (#110)" "## Description
Implement user groups for easier permission management at scale.

## Acceptance Criteria
- [ ] Group management UI in workspace settings:
  - Create/edit/delete groups
  - Add/remove members
  - View group permissions
- [ ] Space permissions UI supports groups:
  - Add group with role
  - Visual distinction from individual users
  - Show member count
- [ ] Group permissions are additive with individual permissions
- [ ] Group mentions (@group-name) in comments

## Dependencies
- #101, #103

## Epic
Part of #${EPIC}" "backend,frontend,m7.5,p2"

# Ticket #111: SCIM Group Sync
create_issue "[M7.5] SCIM Group Sync (#111)" "## Description
Implement SCIM 2.0 protocol for automatic user and group provisioning from identity providers.

## Acceptance Criteria
- [ ] SCIM 2.0 /Users endpoint: GET, POST, PUT, PATCH, DELETE
- [ ] SCIM 2.0 /Groups endpoint: GET, POST, PUT, PATCH, DELETE
- [ ] Authentication: Bearer token validation
- [ ] Support for: Okta, Azure AD, Google Workspace, OneLogin
- [ ] Webhook notifications for provisioning events
- [ ] Documentation for IdP configuration

## API Endpoints
- GET/POST /scim/v2/Users
- GET/PUT/PATCH/DELETE /scim/v2/Users/{id}
- GET/POST /scim/v2/Groups
- GET/PUT/PATCH/DELETE /scim/v2/Groups/{id}

## Dependencies
- #101, #110

## Epic
Part of #${EPIC}" "backend,enterprise,m7.5,p2"

# Ticket #115: Break-glass Admin Recovery
create_issue "[M7.4] Break-glass Admin Recovery (#115)" "## Description
Allow system administrators to recover access to spaces that have no admins (e.g., when the only admin leaves).

## Acceptance Criteria
- [ ] System admin can view all spaces without permission check
- [ ] \\\"Recover Permissions\\\" action in system admin panel
- [ ] Adds system admin as space admin temporarily
- [ ] Logs recovery action to audit log
- [ ] Email notification to workspace owners
- [ ] Cannot be used to bypass document-level restrictions

## Dependencies
- #102, #109

## Epic
Part of #${EPIC}" "backend,frontend,security,m7.4,p2"

echo ""
echo "✅ All tickets created successfully!"
echo ""
echo "Next steps:"
echo "1. Review and assign tickets"
echo "2. Add to M7.1-M7.5 milestones"
echo "3. Update Epic #${EPIC} with ticket links"
