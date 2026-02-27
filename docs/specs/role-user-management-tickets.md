# Chronicle Role & User Management - GitHub Tickets

**Epic:** #76 - Role & User Management System  
**Status:** Ready for Backlog  
**Total Tickets:** 15 tickets across 5 milestones

---

## 📋 Quick Reference

| Ticket | Title | Priority | Size | Milestone |
|--------|-------|----------|------|-----------|
| #101 | Database Schema for RBAC | P0 | M | M7.1 |
| #102 | Core Permission Service Layer | P0 | L | M7.1 |
| #103 | Space Permissions UI | P0 | L | M7.2 |
| #104 | Document Share Dialog | P0 | M | M7.2 |
| #105 | Guest User Management | P1 | L | M7.3 |
| #106 | Public Link Sharing | P1 | M | M7.3 |
| #107 | Internal/External Thread Visibility | P0 | M | M7.3 |
| #108 | RLS Policy Implementation | P0 | M | M7.4 |
| #109 | Permission Audit Logging | P1 | M | M7.4 |
| #110 | Group Management | P2 | L | M7.5 |
| #111 | SCIM Group Sync | P2 | XL | M7.5 |
| #112 | Custom Roles | P2 | L | v2.0 |
| #113 | Domain Restrictions | P3 | M | Enterprise |
| #114 | Permission Analytics | P3 | M | v2.0+ |
| #115 | Break-glass Admin Recovery | P2 | S | M7.4 |

---

## 🎯 M7.1: Core Infrastructure

---

### Ticket #101: Database Schema for RBAC
**Labels:** `backend`, `database`, `m7.1`, `p0`  
**Assignee:** TBD  
**Story Points:** 5

#### Description
Create the database schema for role-based access control including users, groups, permissions, and public links tables with proper indexing and constraints.

#### Acceptance Criteria
- [ ] Create `users` table with `is_external` flag and `external_space_id`
- [ ] Create `groups` and `group_memberships` tables
- [ ] Create `permissions` table with subject/resource polymorphism
- [ ] Create `public_links` table for shareable links
- [ ] Create `mv_effective_permissions` materialized view
- [ ] Add indexes on: `users.workspace_id`, `users.email`, `permissions.resource_id`, `permissions.subject_id`
- [ ] Add migration scripts with rollback
- [ ] Unit tests for schema migrations

#### Technical Notes
- Use `subject_type` and `resource_type` enums for polymorphic associations
- Soft deletes via `deleted_at` on all tables
- UUID primary keys throughout
- Reference: `docs/specs/role-user-management-spec.md` Section 9

#### Dependencies
None (foundational)

---

### Ticket #102: Core Permission Service Layer
**Labels:** `backend`, `go`, `m7.1`, `p0`  
**Assignee:** TBD  
**Story Points:** 8

#### Description
Implement the core permission service in Go with efficient permission checking, grant management, and caching.

#### Acceptance Criteria
- [ ] `PermissionService` interface with methods:
  - `CheckPermission(ctx, userID, resourceType, resourceID, action) (bool, error)`
  - `GrantPermission(ctx, grant) error`
  - `RevokePermission(ctx, grantID) error`
  - `ListPermissions(ctx, resourceType, resourceID) ([]Grant, error)`
  - `GetEffectivePermissions(ctx, userID) (PermissionSet, error)`
- [ ] Materialized view refresh trigger on permission changes
- [ ] Redis caching layer for permission checks (5min TTL)
- [ ] "Additive permissions" logic (most permissive wins)
- [ ] Bulk permission operations for groups
- [ ] Comprehensive unit tests (>80% coverage)

#### Technical Notes
- Cache key format: `perm:{userID}:{resourceType}:{resourceID}:{action}`
- Use Redis for session-level permission caching
- Implement cache invalidation on permission changes
- Handle recursive group membership resolution

#### Dependencies
- #101 (Database Schema)

---

## 🎯 M7.2: UI - Space & Document Permissions

---

### Ticket #103: Space Permissions UI
**Labels:** `frontend`, `react`, `ui`, `m7.2`, `p0`  
**Assignee:** TBD  
**Story Points:** 8

#### Description
Build the space permissions management screen where space admins can manage user, group, and guest access.

#### Acceptance Criteria
- [ ] New "Permissions" tab in Space Settings
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
  - Visual "GUEST" badge on guest entries
  - Revoke guest access
- [ ] Real-time updates when permissions change
- [ ] Loading states and error handling
- [ ] Responsive design

#### Design Mock
```
Space Settings > Permissions
┌──────────────────────────────────────────────────────────┐
│ [Users] [Groups] [Guests]                                │
├──────────────────────────────────────────────────────────┤
│ Add User: [__________] Role: [Editor ▼] [Add]            │
│                                                          │
│ User              Role      Added       Actions          │
│ ──────────────────────────────────────────────────────   │
│ Sarah Chen        Editor    Jan 15      [⋮]              │
│ Marcus Klein      Viewer    Jan 20      [⋮]              │
│ counsel@firm.com  Commenter Feb 01 [G]  [⋮]              │
└──────────────────────────────────────────────────────────┘
```

#### Dependencies
- #102 (Permission Service)

---

### Ticket #104: Document Share Dialog
**Labels:** `frontend`, `react`, `ui`, `m7.2`, `p0`  
**Assignee:** TBD  
**Story Points:** 5

#### Description
Implement the document sharing dialog for managing access modes and inviting users.

#### Acceptance Criteria
- [ ] Share button in document header (visible to editors/admins)
- [ ] Dialog with four access mode radio buttons:
  - Private (owner only)
  - Space Members (inherit from space)
  - Invite Only (named individuals)
  - Anyone with the link
- [ ] For "Invite Only":
  - People list with add/remove
  - Role selector per person
  - Email input with autocomplete
- [ ] For "Anyone with the link":
  - Toggle between Viewer/Commenter
  - Optional password protection
  - Optional expiry date picker
  - Copy link button
  - Regenerate link option
- [ ] Permission summary showing who can access
- [ ] Toast notifications for actions

#### Design Mock
```
Share "Architecture Decision Record"
┌──────────────────────────────────────────────────────────┐
│ ○ Private      ● Space Members   ○ Invite Only ○ Link   │
│                                                          │
│ Who has access                                           │
│ 👤 You (Owner)                                           │
│ 👥 Engineering team (Editor)                             │
│ 👤 partner@ext.com (Viewer) [GUEST]                      │
│                                                          │
│ [+ Add people]                                           │
│                                                          │
│ ☐ Allow comments from guests                             │
│                                                          │
│                      [Copy Link] [Done]                  │
└──────────────────────────────────────────────────────────┘
```

#### Dependencies
- #102 (Permission Service)

---

## 🎯 M7.3: External Collaboration

---

### Ticket #105: Guest User Management
**Labels:** `backend`, `frontend`, `auth`, `m7.3`, `p1`  
**Assignee:** TBD  
**Story Points:** 8

#### Description
Implement full guest user lifecycle: invitation, authentication, restricted access, and visibility controls.

#### Acceptance Criteria
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
  - "GUEST" badge next to guest names
  - Warning banner in spaces with guest access
  - "This thread is visible to external users" warning
- [ ] Guest can:
  - View documents in assigned space
  - Comment on documents (if role allows)
  - Suggest changes (if role allows)
  - Participate in external threads
- [ ] Time-limited access with auto-expiry
- [ ] Email notifications to space admins on guest activity

#### Technical Notes
- Guest users in same `users` table with `is_external=true`
- Separate auth flow for guests (magic link only)
- RLS policies enforce visibility restrictions

#### Dependencies
- #101, #102, #103

---

### Ticket #106: Public Link Sharing
**Labels:** `backend`, `frontend`, `m7.3`, `p1`  
**Assignee:** TBD  **Story Points:** 5

#### Description
Implement public link generation for document sharing without requiring login.

#### Acceptance Criteria
- [ ] Generate secure random token for links
- [ ] Links format: `/share/{token}`
- [ ] Optional password protection (bcrypt)
- [ ] Optional expiry date (auto-revoke)
- [ ] Role selection: Viewer or Commenter
- [ ] Access analytics: view count, last accessed
- [ ] Revoke link functionality
- [ ] Link preview (OpenGraph meta tags)
- [ ] Audit log entry for each access

#### API Contract
```
POST /api/documents/{id}/share-link
{
  "role": "viewer",
  "password": "optional",
  "expiresAt": "2026-03-15T00:00:00Z"
}

Response:
{
  "token": "abc123xyz",
  "url": "https://chronicle.dev/share/abc123xyz",
  "role": "viewer",
  "expiresAt": "2026-03-15T00:00:00Z"
}
```

#### Dependencies
- #101, #102

---

### Ticket #107: Internal/External Thread Visibility
**Labels:** `backend`, `frontend`, `security`, `m7.3`, `p0`  
**Assignee:** TBD  
**Story Points:** 5

#### Description
Implement the critical security feature that separates internal team deliberation from external client communication.

#### Acceptance Criteria
- [ ] Thread `visibility` column: `INTERNAL` (default) or `EXTERNAL`
- [ ] UI: Visibility toggle when creating/editing thread
  - "Internal (team only)" selected by default
  - "External (visible to guests)" with warning icon
- [ ] When external visibility selected:
  - Warning banner: "This thread will be visible to external guests"
  - Show which guests will see it
- [ ] External users:
  - Never see INTERNAL threads in API responses
  - Cannot be added to internal threads
  - Only see EXTERNAL threads they are mentioned in
- [ ] RLS policy enforcing visibility
- [ ] Sync Gateway filtering for external sessions
- [ ] Visual distinction in thread list (lock icon for internal)

#### Security Requirements
```sql
-- RLS Policy
CREATE POLICY threads_visibility ON threads
USING (
    visibility = 'EXTERNAL'
    OR current_setting('app.is_external')::bool = false
);
```

#### Dependencies
- #101, #105

---

## 🎯 M7.4: Security & Audit

---

### Ticket #108: RLS Policy Implementation
**Labels:** `backend`, `database`, `security`, `m7.4`, `p0`  
**Assignee:** TBD  
**Story Points:** 5

#### Description
Implement PostgreSQL Row-Level Security policies to enforce permission rules at the database layer.

#### Acceptance Criteria
- [ ] Enable RLS on all permission-sensitive tables:
  - `documents`
  - `threads`
  - `annotations`
  - `branches`
  - `decision_log`
- [ ] Create policies for each table:
  - Select: only if user has view permission
  - Insert: only if user has edit permission
  - Update: only if user has edit permission
  - Delete: only if user has admin permission
- [ ] Set application context on every DB connection:
  - `app.current_user_id`
  - `app.is_external`
- [ ] Test policies with external user simulation
- [ ] Document policy behavior

#### Tables & Policies
| Table | Select | Insert | Update | Delete |
|-------|--------|--------|--------|--------|
| documents | Has view | Has edit | Has edit | Has admin |
| threads | Visibility rules | Has comment | Author only | Has admin |
| annotations | Has view | Has comment | Author only | Has admin |
| branches | Has view | Has edit | Has edit | Has admin |
| decision_log | Has view | System only | Denied | Denied |

#### Dependencies
- #101, #102

---

### Ticket #109: Permission Audit Logging
**Labels:** `backend`, `security`, `m7.4`, `p1`  
**Assignee:** TBD  
**Story Points:** 3

#### Description
Log all permission changes to the audit log for compliance and security review.

#### Acceptance Criteria
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
  - Timestamp
  - IP address
- [ ] Export API for audit logs (admin only)
- [ ] UI: Simple audit view in space settings

#### Audit Event Schema
```json
{
  "action": "permission.granted",
  "actor": { "id": "...", "email": "..." },
  "subject": { "type": "user", "id": "...", "email": "..." },
  "resource": { "type": "space", "id": "...", "name": "..." },
  "metadata": { "role": "editor", "granted_at": "..." },
  "ip": "192.168.1.1",
  "timestamp": "2026-02-28T10:30:00Z"
}
```

#### Dependencies
- #102

---

### Ticket #115: Break-glass Admin Recovery
**Labels:** `backend`, `frontend`, `security`, `m7.4`, `p2`  
**Assignee:** TBD  
**Story Points:** 2

#### Description
Allow system administrators to recover access to spaces that have no admins (e.g., when the only admin leaves).

#### Acceptance Criteria
- [ ] System admin can view all spaces without permission check
- [ ] "Recover Permissions" action in system admin panel
- [ ] Adds system admin as space admin temporarily
- [ ] Logs recovery action to audit log
- [ ] Email notification to workspace owners
- [ ] Cannot be used to bypass document-level restrictions

#### Dependencies
- #102, #109

---

## 🎯 M7.5: Groups & Enterprise

---

### Ticket #110: Group Management
**Labels:** `backend`, `frontend`, `m7.5`, `p2`  
**Assignee:** TBD  
**Story Points:** 8

#### Description
Implement user groups for easier permission management at scale.

#### Acceptance Criteria
- [ ] Group management UI in workspace settings:
  - Create/edit/delete groups
  - Add/remove members
  - View group permissions
- [ ] Space permissions UI supports groups:
  - Add group with role
  - Visual distinction from individual users
  - Show member count
- [ ] Group permissions are additive with individual permissions
- [ ] Groups can be nested (optional stretch)
- [ ] Group mentions (@group-name) in comments

#### Dependencies
- #101, #103

---

### Ticket #111: SCIM Group Sync
**Labels:** `backend`, `enterprise`, `m7.5`, `p2`  
**Assignee:** TBD  
**Story Points:** 13

#### Description
Implement SCIM 2.0 protocol for automatic user and group provisioning from identity providers.

#### Acceptance Criteria
- [ ] SCIM 2.0 `/Users` endpoint:
  - GET, POST, PUT, PATCH, DELETE
  - Filter support (by email, externalId)
- [ ] SCIM 2.0 `/Groups` endpoint:
  - GET, POST, PUT, PATCH, DELETE
  - Member management
- [ ] Authentication: Bearer token validation
- [ ] Support for:
  - Okta
  - Azure AD
  - Google Workspace
  - OneLogin
- [ ] Webhook notifications for provisioning events
- [ ] Documentation for IdP configuration

#### API Endpoints
```
GET    /scim/v2/Users
POST   /scim/v2/Users
GET    /scim/v2/Users/{id}
PUT    /scim/v2/Users/{id}
PATCH  /scim/v2/Users/{id}
DELETE /scim/v2/Users/{id}

GET    /scim/v2/Groups
POST   /scim/v2/Groups
GET    /scim/v2/Groups/{id}
PUT    /scim/v2/Groups/{id}
PATCH  /scim/v2/Groups/{id}
DELETE /scim/v2/Groups/{id}
```

#### Dependencies
- #101, #110

---

## 🎯 v2.0+ Future Work

---

### Ticket #112: Custom Roles
**Labels:** `backend`, `frontend`, `v2.0`, `p2`  
**Assignee:** TBD  
**Story Points:** 8

#### Description
Allow workspace admins to define custom roles with specific permission combinations.

#### Acceptance Criteria
- [ ] Role management UI:
  - Create custom role
  - Select from granular permissions
  - Set role name and description
  - Limit: 10 custom roles per workspace
- [ ] Granular permissions available:
  - view_documents
  - create_documents
  - edit_documents
  - delete_own_documents
  - delete_any_documents
  - add_comments
  - delete_own_comments
  - delete_any_comments
  - suggest_changes
  - manage_space_permissions
  - export_space
  - manage_templates
- [ ] Custom roles appear in permission UIs
- [ ] Migration path for existing permissions

#### Dependencies
- #101, #102, #103

---

### Ticket #113: Domain Restrictions
**Labels:** `backend`, `enterprise`, `v2.0`, `p3`  
**Assignee:** TBD  
**Story Points:** 3

#### Description
Allow workspace admins to restrict external sharing to approved email domains only.

#### Acceptance Criteria
- [ ] Workspace setting: "Restrict external shares to domains"
- [ ] Comma-separated domain list input
- [ ] Validation on guest invitation
- [ ] Validation on public link sharing
- [ ] Clear error message when domain not allowed
- [ ] Audit log entry for blocked attempts

#### Dependencies
- #105, #106

---

### Ticket #114: Permission Analytics
**Labels:** `backend`, `frontend`, `v2.0`, `p3`  
**Assignee:** TBD  
**Story Points:** 5

#### Description
Provide insights into who can access what content for security auditing.

#### Acceptance Criteria
- [ ] "Permission Report" in admin panel
- [ ] Show:
  - Documents with guest access
  - Documents with public links
  - Users with access to specific documents
  - Permission inheritance tree
- [ ] Export to CSV
- [ ] Filter by space, user type, access level

#### Dependencies
- #102

---

## 📊 Implementation Roadmap

```
Week 1-2:  M7.1  [========]  #101, #102
Week 3-4:  M7.2  [========]  #103, #104
Week 5-6:  M7.3  [========]  #105, #106, #107
Week 7-8:  M7.4  [========]  #108, #109, #115
Week 9-10: M7.5  [========]  #110, #111
Week 11+:  v2.0  [........]  #112, #113, #114
```

---

## 🔗 Dependencies Graph

```
#101 (Schema)
   │
   ├──► #102 (Service)
   │      │
   │      ├──► #103 (Space UI)
   │      │      │
   │      │      └──► #110 (Groups)
   │      │             │
   │      │             └──► #111 (SCIM)
   │      │
   │      ├──► #104 (Share Dialog)
   │      │
   │      ├──► #105 (Guests) ──► #107 (Thread Visibility)
   │      │
   │      ├──► #106 (Public Links)
   │      │
   │      ├──► #108 (RLS)
   │      │
   │      └──► #109 (Audit) ──► #115 (Break-glass)
   │
   └──► All other tickets
```

---

**Related Documents:**
- [High-Level Spec](./role-user-management-spec.md)
- [Architecture Model](../architecture-model/README.md)
- [GitHub Epic #76](https://github.com/chronicle/issues/76)
