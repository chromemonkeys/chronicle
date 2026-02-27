#!/bin/bash
# Setup GitHub Project "Chronicle Development" with Sprint 3
# and add all Role & User Management tickets
#
# Usage: ./scripts/setup-sprint-3.sh
# Requires: gh auth with repo scope, GITHUB_TOKEN env var

set -e

REPO_OWNER=$(gh repo view --json owner --jq '.owner.login' 2>/dev/null || echo "")
REPO_NAME=$(gh repo view --json name --jq '.name' 2>/dev/null || echo "")

if [ -z "$REPO_OWNER" ] || [ -z "$REPO_NAME" ]; then
    echo "Error: Could not determine repository. Run from within the repo."
    exit 1
fi

echo "Setting up Sprint 3 for $REPO_OWNER/$REPO_NAME..."

# Get GitHub token
GH_TOKEN=$(gh auth token 2>/dev/null || echo "")
if [ -z "$GH_TOKEN" ]; then
    echo "Error: Not authenticated with gh CLI. Run 'gh auth login'"
    exit 1
fi

# =============================================================================
# STEP 1: Create the GitHub Project (Table view)
# =============================================================================
echo ""
echo "📋 Step 1: Creating GitHub Project 'Chronicle Development'..."

PROJECT_DATA=$(curl -s -X POST \
    -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    https://api.github.com/graphql \
    -d "{
        \"query\": \"mutation {\\n  createProjectV2(input: {\\n    ownerId: \\\"$REPO_OWNER\\\",\\n    title: \\\"Chronicle Development\\\",\\n  }) {\\n    projectV2 {\\n      id\\n      number\\n      title\\n    }\\n  }\\n}\"
    }" 2>/dev/null || echo "")

# Check if project was created or already exists
PROJECT_NUMBER=$(echo "$PROJECT_DATA" | grep -o '"number":[0-9]*' | head -1 | cut -d':' -f2 || echo "")

if [ -z "$PROJECT_NUMBER" ]; then
    # Try to find existing project
    echo "   Project may already exist. Checking..."
    
    # List existing projects
    EXISTING_PROJECTS=$(curl -s -X POST \
        -H "Authorization: Bearer $GH_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        -H "X-GitHub-Api-Version: 2022-11-28" \
        https://api.github.com/graphql \
        -d "{
            \"query\": \"query {\\n  repository(owner: \\\"$REPO_OWNER\\\", name: \\\"$REPO_NAME\\\") {\\n    projectsV2(first: 10) {\\n      nodes {\\n        id\\n        number\\n        title\\n      }\\n    }\\n  }\\n}\"
        }" 2>/dev/null)
    
    PROJECT_NUMBER=$(echo "$EXISTING_PROJECTS" | grep -o '"number":[0-9]*' | head -1 | cut -d':' -f2 || echo "")
    
    if [ -z "$PROJECT_NUMBER" ]; then
        echo "   ⚠️ Could not create or find project. Using manual setup approach..."
        echo ""
        echo "   Please create a project manually at:"
        echo "   https://github.com/$REPO_OWNER/$REPO_NAME/projects"
        echo ""
    else
        echo "   ✅ Found existing project #$PROJECT_NUMBER"
    fi
else
    echo "   ✅ Created project #$PROJECT_NUMBER"
fi

# =============================================================================
# STEP 2: Create Sprint 3 Iteration field
# =============================================================================
echo ""
echo "📅 Step 2: Setting up Sprint 3 iteration..."

# Note: GitHub Projects V2 uses custom fields. We'll document the manual steps
# as the GraphQL API for iterations is complex

echo ""
echo "   ⚠️ IMPORTANT: Please complete these manual steps:"
echo ""
echo "   1. Go to: https://github.com/$REPO_OWNER/$REPO_NAME/projects"
echo "   2. Open 'Chronicle Development' project"
echo "   3. Click 'Settings' (gear icon)"
echo "   4. Add custom fields:"
echo "      - 'Sprint' (Iteration type)"
echo "      - Create iteration 'Sprint 3' with dates"
echo "      - 'Priority' (Single select: P0, P1, P2, P3)"
echo "      - 'Size' (Single select: XS, S, M, L, XL)"
echo ""

# =============================================================================
# STEP 3: Create all the issues
# =============================================================================
echo "📋 Step 3: Creating GitHub issues for Role & User Management..."
echo ""

# Issue creation helper
create_issue() {
    local title="$1"
    local body="$2"
    local labels="$3"
    
    # Create issue and get the number
    issue_url=$(gh issue create \
        --title "$title" \
        --body "$body" \
        --label "$labels" 2>/dev/null | grep -o 'https://github.com.*/issues/[0-9]*' || echo "")
    
    if [ -n "$issue_url" ]; then
        issue_number=$(echo "$issue_url" | grep -o '[0-9]*$')
        echo "     ✅ Created #$issue_number: $title"
        echo "$issue_number"
    else
        echo "     ❌ Failed to create: $title"
        echo ""
    fi
}

# Track created issues
 declare -a ISSUE_NUMBERS

# Ticket #101: Database Schema
echo "   Creating #101..."
ISSUE_101=$(create_issue "[M7.1] Database Schema for RBAC" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,database,m7.1,p0")
ISSUE_NUMBERS+=("$ISSUE_101")

# Ticket #102: Core Permission Service
echo "   Creating #102..."
ISSUE_102=$(create_issue "[M7.1] Core Permission Service Layer" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,go,m7.1,p0")
ISSUE_NUMBERS+=("$ISSUE_102")

# Ticket #103: Space Permissions UI
echo "   Creating #103..."
ISSUE_103=$(create_issue "[M7.2] Space Permissions UI" "## Description
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
Part of #76

## Sprint
Sprint 3" "frontend,react,ui,m7.2,p0")
ISSUE_NUMBERS+=("$ISSUE_103")

# Ticket #104: Document Share Dialog
echo "   Creating #104..."
ISSUE_104=$(create_issue "[M7.2] Document Share Dialog" "## Description
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
Part of #76

## Sprint
Sprint 3" "frontend,react,ui,m7.2,p0")
ISSUE_NUMBERS+=("$ISSUE_104")

# Ticket #105: Guest User Management
echo "   Creating #105..."
ISSUE_105=$(create_issue "[M7.3] Guest User Management" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,frontend,auth,m7.3,p1")
ISSUE_NUMBERS+=("$ISSUE_105")

# Ticket #106: Public Link Sharing
echo "   Creating #106..."
ISSUE_106=$(create_issue "[M7.3] Public Link Sharing" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,frontend,m7.3,p1")
ISSUE_NUMBERS+=("$ISSUE_106")

# Ticket #107: Internal/External Thread Visibility
echo "   Creating #107..."
ISSUE_107=$(create_issue "[M7.3] Internal/External Thread Visibility" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,frontend,security,m7.3,p0")
ISSUE_NUMBERS+=("$ISSUE_107")

# Ticket #108: RLS Policy Implementation
echo "   Creating #108..."
ISSUE_108=$(create_issue "[M7.4] RLS Policy Implementation" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,database,security,m7.4,p0")
ISSUE_NUMBERS+=("$ISSUE_108")

# Ticket #109: Permission Audit Logging
echo "   Creating #109..."
ISSUE_109=$(create_issue "[M7.4] Permission Audit Logging" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,security,m7.4,p1")
ISSUE_NUMBERS+=("$ISSUE_109")

# Ticket #110: Group Management
echo "   Creating #110..."
ISSUE_110=$(create_issue "[M7.5] Group Management" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,frontend,m7.5,p2")
ISSUE_NUMBERS+=("$ISSUE_110")

# Ticket #111: SCIM Group Sync
echo "   Creating #111..."
ISSUE_111=$(create_issue "[M7.5] SCIM Group Sync" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,enterprise,m7.5,p2")
ISSUE_NUMBERS+=("$ISSUE_111")

# Ticket #115: Break-glass Admin Recovery
echo "   Creating #115..."
ISSUE_115=$(create_issue "[M7.4] Break-glass Admin Recovery" "## Description
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
Part of #76

## Sprint
Sprint 3" "backend,frontend,security,m7.4,p2")
ISSUE_NUMBERS+=("$ISSUE_115")

# =============================================================================
# STEP 4: Summary
# =============================================================================
echo ""
echo "✅ Sprint 3 Setup Complete!"
echo ""
echo "📊 Summary:"
echo "   - 12 new issues created for Role & User Management"
echo "   - Milestones: M7.1, M7.2, M7.3, M7.4, M7.5"
echo ""
echo "🔜 Next Steps (Manual):"
echo "   1. Create Project at: https://github.com/$REPO_OWNER/$REPO_NAME/projects"
echo "   2. Add 'Sprint' iteration field"
echo "   3. Add issues to Project and set Sprint = 'Sprint 3'"
echo "   4. Add Priority and Size fields"
echo ""
echo "   Or use this direct link to create the project:"
echo "   https://github.com/$REPO_OWNER/$REPO_NAME/projects?type=beta"
echo ""
echo "📋 Issue Numbers Created:"
for num in "${ISSUE_NUMBERS[@]}"; do
    echo "      - #$num"
done
