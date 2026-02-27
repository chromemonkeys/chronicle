# Chronicle Role & User Management System
## High-Level Specification

**Status:** Draft  
**Target:** v1.1 (M7: Permissions milestone)  
**Author:** Product/Architecture Team  
**Last Updated:** 2026-02-28

---

## 1. Executive Summary

This specification defines Chronicle's role-based access control (RBAC) and user management system, designed to match Confluence's market-leading permission model while adding Chronicle's unique governance features. The system supports:

- **Hierarchical permissions**: Workspace → Space → Document levels
- **Role-based access**: Five built-in roles with granular permissions
- **External collaboration**: Guest users and public link sharing
- **Professional services features**: Client portal with internal/external thread separation
- **Enterprise security**: SCIM provisioning, SSO integration, audit logging

---

## 2. Design Principles

| Principle | Description |
|-----------|-------------|
| **Additive Permissions** | Most permissive grant wins (same as Confluence) |
| **Explicit Over Implicit** | Document-level permissions override space-level |
| **Fail Closed** | No access is the default; must be explicitly granted |
| **Audit Everything** | Every permission change is logged immutably |
| **External Safety** | External users can never see internal deliberation |

---

## 3. Permission Architecture

### 3.1 Three-Layer Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKSPACE LEVEL                               │
│  • Who can create spaces                                         │
│  • Global admin rights                                           │
│  • SSO/SCIM configuration                                        │
├─────────────────────────────────────────────────────────────────┤
│                     SPACE LEVEL                                  │
│  • View / Add / Edit / Delete pages                             │
│  • Comment / Upload attachments                                  │
│  • Manage space settings                                         │
├─────────────────────────────────────────────────────────────────┤
│                   DOCUMENT LEVEL                                 │
│  • View restrictions (who can see)                               │
│  • Edit restrictions (who can modify)                            │
│  • Approval chain assignments                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Role Definitions

#### Built-in Roles (Confluence-Aligned)

| Role | View | Comment | Suggest | Edit | Delete | Admin | Best For |
|------|------|---------|---------|------|--------|-------|----------|
| **Viewer** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | Stakeholders, clients read-only |
| **Commenter** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | Reviewers, auditors |
| **Suggester** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | External counsel, contractors |
| **Editor** | ✓ | ✓ | ✓ | ✓ | Own | ✗ | Team members, contributors |
| **Admin** | ✓ | ✓ | ✓ | ✓ | Any | ✓ | Space owners, team leads |

**Permission Details:**
- **View**: Read document content, see version history
- **Comment**: Add annotations to accessible documents
- **Suggest**: Propose tracked changes (suggestion mode)
- **Edit**: Direct document modification, create branches
- **Delete Own**: Remove content you created
- **Delete Any**: Remove any content in scope
- **Admin**: Manage permissions, templates, space settings

#### Custom Roles (Enterprise)
- Up to 10 custom roles per workspace
- Granular permission combinations
- Example: "Legal Reviewer" (View + Comment + Suggest, no Delete)

---

## 4. User Types

### 4.1 Internal Members

Full workspace members with complete feature access within their permission scope.

| Attribute | Internal User |
|-----------|---------------|
| Authentication | Email/Password, Google OAuth, SAML SSO |
| Feature Access | Full (based on role) |
| @Mentions | All workspace members |
| Approval Chains | Can be assigned as approvers |
| SCIM Managed | Yes (deprovisioning supported) |

### 4.2 Guest Users (External)

Limited-access users for external collaboration. **Chronicle differentiator**: Unlike Confluence's 5-guests-per-license limit, Chronicle OSS has no artificial limits.

| Feature | Guest Access | Notes |
|---------|--------------|-------|
| Space Access | Single space only | Assigned by admin |
| Document Access | Based on space role | Can be further restricted |
| @Mentions | Guests in same space only | No access to people directory |
| Internal Threads | **Blocked** | Critical security feature |
| External Threads | Can participate | Visible to other guests |
| People Directory | No access | Cannot browse users |
| Approval Chains | Can be assigned | As external approver |
| Time-Limited Access | Yes | Optional expiry date |

**Guest Identification:**
- "GUEST" badge in UI next to name
- Visual indicators in spaces with guest access
- Email notifications to space admins when guests added

### 4.3 Anonymous/Public Access

| Feature | Anonymous User |
|---------|----------------|
| Access Method | Public link (no login) |
| Permissions | Viewer or Commenter only |
| Authentication | None required |
| Password Protection | Optional |
| Expiry | Optional date/time |
| Audit | Link access logged |

---

## 5. Sharing Modes

### 5.1 Private
- Owner only
- Not discoverable in search
- Useful for: Drafts, personal notes

### 5.2 Space Members (Default)
- Inherits space permissions
- Role determined by space membership
- Useful for: Team documents, standard workflows

### 5.3 Invite Only
- Named individuals with explicit roles
- Overrides space permissions both ways
- Useful for: Sensitive documents, client collaboration

### 5.4 Public Link
- Anyone with link can access
- Configurable: View only or Comment
- Optional password protection
- Optional expiry date
- Revocable at any time
- Useful for: Public docs, auditor access, published policies

---

## 6. Internal vs External Discussion

**Critical feature for professional services use case.**

| Thread Type | Visibility | Use Case |
|-------------|------------|----------|
| **Internal** (default) | Workspace members only | "Client will push back on this clause — pre-empt?" |
| **External** | Explicitly shared guests | "Please confirm entity name per Delaware cert" |

**Enforcement:** Three-layer protection
1. **Database RLS**: External users physically cannot query internal threads
2. **API filtering**: Middleware excludes internal threads from responses
3. **Sync Gateway**: Does not broadcast internal thread events to external sessions

---

## 7. Permission Management UI

### 7.1 Space Permissions Screen

```
┌─────────────────────────────────────────────────────────────────┐
│  Space Settings > Permissions                                    │
├─────────────────────────────────────────────────────────────────┤
│  Users                          Groups         Guests           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  User              Role           Added         Actions   │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Sarah Chen        Editor         Jan 15        ⋮        │   │
│  │  Marcus Klein      Viewer         Jan 20        ⋮        │   │
│  │  external@law.com  Commenter (G)  Feb 01        ⋮        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [+ Add User]  [+ Add Group]  [+ Invite Guest]                  │
│                                                                 │
│  ─────────────────────────────────────────────────────────     │
│  Anonymous Access: [Disabled ▼]                                 │
│  Default Document Permissions: [Space Members ▼]                │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Document Share Dialog

```
┌──────────────────────────────────────────────────────────────┐
│  Share "Engagement Letter"                              [X]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Who can access                                              │
│  ○ Private (only you)                                        │
│  ● Space Members                                             │
│  ○ Invite only                                               │
│  ○ Anyone with the link                                      │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  People with access                                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 👤 You (Owner)                                      │   │
│  │ 👥 Engineering (Editor)                             │   │
│  │ 👤 external@client.com (Viewer) [GUEST]             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Add people]                                              │
│                                                              │
│  ☑️ Allow comments from external users                       │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. API Endpoints

### 8.1 Permission Management

```
GET    /api/spaces/{id}/permissions
POST   /api/spaces/{id}/permissions/grant
DELETE /api/spaces/{id}/permissions/{grantId}

GET    /api/documents/{id}/permissions
POST   /api/documents/{id}/permissions/grant
POST   /api/documents/{id}/share-link        # Create public link
DELETE /api/documents/{id}/share-link/{token} # Revoke public link

GET    /api/workspaces/{id}/guests
POST   /api/workspaces/{id}/guests/invite
DELETE /api/workspaces/{id}/guests/{userId}
```

### 8.2 Permission Checking

```
GET /api/permissions/check?resource={id}&action={action}
# Returns: { allowed: true/false, reason: "...", role: "..." }
```

---

## 9. Database Schema

### 9.1 Core Tables

```sql
-- Users (internal and external in same table)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    is_external BOOLEAN DEFAULT FALSE,  -- Key discriminator
    external_space_id UUID REFERENCES spaces(id), -- For guests: single space
    external_expires_at TIMESTAMPTZ,    -- Optional time limit
    auth_provider VARCHAR(50),          -- email, google, saml
    scim_external_id VARCHAR(255),      -- For IdP sync
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ              -- Soft delete
);

-- Groups (for IdP sync and manual groups)
CREATE TABLE groups (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name VARCHAR(255) NOT NULL,
    scim_external_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group memberships
CREATE TABLE group_memberships (
    group_id UUID REFERENCES groups(id),
    user_id UUID REFERENCES users(id),
    PRIMARY KEY (group_id, user_id)
);

-- Permission grants (can be to user or group)
CREATE TABLE permissions (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    
    -- Subject (who)
    subject_type VARCHAR(10) NOT NULL CHECK (subject_type IN ('user', 'group')),
    subject_id UUID NOT NULL,  -- References users.id or groups.id
    
    -- Resource (what)
    resource_type VARCHAR(10) NOT NULL CHECK (resource_type IN ('workspace', 'space', 'document')),
    resource_id UUID NOT NULL,
    
    -- Permission level
    role VARCHAR(20) NOT NULL CHECK (role IN ('viewer', 'commenter', 'suggester', 'editor', 'admin')),
    
    -- Metadata
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- Optional time limit
    
    UNIQUE(workspace_id, subject_type, subject_id, resource_type, resource_id)
);

-- Materialized view for fast permission checks
CREATE MATERIALIZED VIEW mv_effective_permissions AS
-- Complex query that resolves additive permissions
-- Refreshed on any permission change

-- Public share links
CREATE TABLE public_links (
    id UUID PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,  -- URL token
    document_id UUID NOT NULL REFERENCES documents(id),
    created_by UUID REFERENCES users(id),
    role VARCHAR(20) NOT NULL CHECK (role IN ('viewer', 'commenter')),
    password_hash VARCHAR(255),  -- Optional bcrypt hash
    expires_at TIMESTAMPTZ,      -- Optional
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
```

### 9.2 Row-Level Security Policies

```sql
-- Threads: External users never see INTERNAL threads
CREATE POLICY threads_visibility ON threads
USING (
    visibility = 'EXTERNAL'
    OR current_setting('app.is_external')::bool = false
);

-- Documents: Users can only see documents they have view access to
CREATE POLICY documents_visibility ON documents
USING (
    EXISTS (
        SELECT 1 FROM mv_effective_permissions p
        WHERE p.resource_type = 'document'
        AND p.resource_id = documents.id
        AND p.user_id = current_setting('app.current_user_id')::UUID
        AND p.role IN ('viewer', 'commenter', 'suggester', 'editor', 'admin')
    )
);
```

---

## 10. Enterprise Features

| Feature | Description | Tier |
|---------|-------------|------|
| **Group Sync** | SCIM provisioning from IdP | v1.1 |
| **Custom Roles** | Up to 10 custom permission combinations | v1.1 |
| **Domain Restrictions** | Only allow shares to approved domains | Enterprise |
| **Watermarking** | Dynamic watermarks on PDF exports | Enterprise |
| **Legal Hold** | Prevent deletion/archival of documents | Enterprise |
| **Advanced Audit** | Exportable permission change logs | Enterprise |

---

## 11. Migration from Confluence

| Confluence Concept | Chronicle Equivalent |
|-------------------|---------------------|
| Global Permissions | Workspace-level admin rights |
| Space Permissions | Space permissions with same roles |
| Page Restrictions | Document-level invite-only sharing |
| Guest Users | External guests (single space) |
| Anonymous Access | Public links |
| confluence-administrators | workspace_admin role |

---

## 12. Acceptance Criteria

### 12.1 Must Have (v1.1)
- [ ] Five built-in roles implemented
- [ ] Space-level permission management
- [ ] Document-level sharing (all four modes)
- [ ] Guest user support (single space)
- [ ] Public link sharing with optional password/expiry
- [ ] Internal/external thread separation
- [ ] RLS policies enforcing visibility
- [ ] Permission audit logging

### 12.2 Should Have (v1.1-stretch)
- [ ] Group-based permissions
- [ ] SCIM group sync
- [ ] Custom role creation
- [ ] Bulk permission operations

### 12.3 Future (v2.0+)
- [ ] Domain-restricted sharing
- [ ] Watermarking
- [ ] Legal hold
- [ ] Advanced analytics on permissions

---

## 13. Open Questions

1. **Guest Limit**: Should OSS have unlimited guests or a soft limit?
2. **Nested Groups**: Do we need group nesting for enterprise?
3. **Break-glass**: How should system admins recover space access?
4. **Permission Analytics**: Should we show who can access what reports?

---

**Related Documents:**
- [Technical Architecture](../agent-memory/Chronicle_Technical_Architecture.txt)
- [Product Vision](../agent-memory/Chronicle_Product_Vision_v2.txt)
- [Architecture Model](../architecture-model/README.md)
