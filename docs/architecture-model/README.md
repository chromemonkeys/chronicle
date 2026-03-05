# Chronicle Architecture Model

> **Last Updated:** 2026-03-05 (Space visibility enforcement: restricted spaces hidden from non-members via ListAccessibleSpaceIDs; GET /api/workspaces and GET /api/spaces/{id}/documents now filter by user permissions)
> **Version:** 1.0  
> **Status:** Canonical reference for system architecture

## Quick Links for Developers

- 🆕 **[Permissions & Sharing Handoff](../HANDOFF_PERMISSIONS_SHARING.md)** - Current status and implementation roadmap for document sharing, space permissions, and reviewer management
- [Technical Architecture (Full)](../agent-memory/Chronicle_Technical_Architecture.txt)
- [Product Vision](../agent-memory/Chronicle_Product_Vision_v2.txt)

This document is the single source of truth for Chronicle's system architecture. It must be updated whenever structural changes are made to the codebase.

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
│  React 18 + TipTap/ProseMirror + Yjs (y-prosemirror)                        │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ WebSocket / HTTP
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                            SYNC GATEWAY                                      │
│  Node.js + y-websocket + JWT auth + Redis pub/sub                           │
│  • Real-time collaboration (Yjs CRDT)                                       │
│  • WebSocket connection management                                          │
│  • Stateless horizontally scalable                                          │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ Internal HTTP
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                              API SERVER                                      │
│  Go + Fiber + JWT middleware + RBAC                                         │
│  • Business logic, permissions, approvals                                   │
│  • Git operations (go-git)                                                  │
│  • Decision log, notifications                                              │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────────────┐
│                              DATA LAYER                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PostgreSQL  │  │  Redis 7    │  │ Meilisearch │  │   Git (go-git)      │ │
│  │    (16)     │  │             │  │             │  │                     │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                 Object Store (S3-compatible)                           │ │
│  │                    MinIO (self-host) / AWS S3                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
chronicle/
├── api/                          # Go API server source
│   └── (TBD - future location for Go backend)
├── backend/                      # WebSocket Sync Gateway (Node.js)
├── db/                           # Database migrations and schemas
├── docker/                       # Docker configuration files
├── docs/                         # Documentation
│   ├── agent-memory/            # Agent startup context files
│   ├── architecture-model/      # ← YOU ARE HERE (this folder)
│   ├── archive/                 # Archived documentation
│   ├── runbooks/                # Operational runbooks
│   └── specs/                   # Technical specifications
├── scripts/                      # Utility scripts
├── src/                          # Frontend React/TypeScript source
│   ├── api/                     # API client and type definitions
│   ├── components/              # Shared React components (minimal)
│   ├── editor/                  # TipTap/ProseMirror editor
│   │   ├── extensions/          # Custom editor extensions
│   │   └── sync/                # Real-time sync providers
│   ├── lib/                     # Utility libraries and helpers
│   ├── mocks/                   # Mock data for development
│   ├── state/                   # React context providers
│   ├── ui/                      # UI components (DocumentTree, etc.)
│   ├── views/                   # Page-level components
│   │   └── settings/            # Settings page tab components
│   ├── main.tsx                 # Application entry point
│   ├── router.tsx               # React Router configuration
│   └── styles.css               # Global CSS styles
├── tests/                        # Test files
│   └── e2e/                     # Playwright E2E tests
└── dist/                         # Build output
```

---

## Service Architecture

### API Server (Go)

| Package | Responsibility |
|---------|---------------|
| `cmd/api` | Main API server entry point (Fiber HTTP framework) |
| `cmd/sync-trigger` | Session-ended event processor |
| `internal/auth` | JWT generation, validation, SAML/OIDC handlers |
| `internal/documents` | Document CRUD, branch management, diff rendering |
| `internal/git` | All go-git operations (commit, branch, tag, merge) |
| `internal/deliberation` | Threads, annotations, decision log, resolution workflows |
| `internal/approvals` | Approval chain evaluation, gate checking |
| `internal/permissions` | RBAC evaluation, row-level security |
| `internal/search` | Meilisearch indexing and query |
| `internal/export` | Document export pipeline (ProseMirror -> HTML -> PDF/DOCX) |
| `internal/storage` | S3-compatible object store (MinIO) — upload, serve, bucket management |
| `internal/notifications` | Email, webhook, Redis pub/sub event dispatch |

### Sync Gateway (Node.js)

| Component | Responsibility |
|-----------|---------------|
| WebSocket Server | JWT validation, room management |
| Yjs Integration | y-websocket provider, Y.Doc state management |
| Redis Pub/Sub | Multi-instance coordination |
| Snapshot Persistence | Auto-save to PostgreSQL every 30s |
| Session Management | 60s cleanup after last disconnect |

### Frontend (React + TypeScript)

| Layer | Technology | Purpose |
|-------|------------|---------|
| UI Framework | React 18 | Component model, state management |
| Editor Engine | TipTap + ProseMirror | Document editing experience |
| Real-time Sync | Yjs + y-prosemirror | Collaborative editing |
| Build Tool | Vite | Bundling, dev server |
| Testing | Playwright | E2E testing (real backend only) |

---

## Data Stores

### PostgreSQL 16

Stores all operational metadata. **Never stores document content** (that lives in Git).

| Domain | Tables |
|--------|--------|
| Identity | `users` *(deactivated_at)*, `workspace_memberships`, `email_verifications`, `password_resets` |
| Permissions | `permissions` *(unified space+document)*, `document_permissions` *(RBAC-102)*, `permission_denials` *(RBAC-101 audit)* |
| Groups | `groups`, `group_memberships` |
| Documents | `workspaces`, `spaces` *(visibility column)*, `documents` *(deleted_at for soft-delete)*, `document_versions` |
| Version Control | `branches`, `branch_approvals` |
| Deliberation | `threads`, `annotations`, `decision_log` |
| Audit | `audit_log`, `permission_denials` |
| Real-time | `yjs_snapshots`, `yjs_updates_log` |

### Redis 7

Ephemeral data only. All data is reconstructible.

| Purpose | Data |
|---------|------|
| Session Cache | JWT validation cache (5min TTL) |
| Token Storage | Refresh tokens with TTL *(AUTH-102)* |
| Coordination | Sync Gateway pub/sub for multi-instance |
| Rate Limiting | Counter storage |
| Notifications | Queue fan-out |

### Meilisearch

Full-text search index. Derived data - always rebuildable from Postgres + Git.

### Git (go-git)

Document content and version history. One bare repository per document.

```
/repos/{workspace_id}/{document_id}.git/
├── HEAD                    → ref: refs/heads/main
├── refs/
│   ├── heads/
│   │   ├── main           → Protected live document
│   │   └── proposals/{uuid} → Proposal branches
│   └── tags/              → Named versions
├── objects/               → Git object database
└── content.md             → The document (only file)
```

### S3-Compatible Object Store

Binary and large objects only. **Never stores text content.**

| Content Type | Storage Path |
|--------------|--------------|
| File attachments | `/attachments/{document_id}/{file_id}` |
| Image uploads | `/uploads/{document_id}/{image_id}` |
| PDF exports | `/exports/{document_id}/{version}.pdf` |
| Embed thumbnails | `/thumbnails/{cache_key}` |

---

## Critical Boundaries

### Yjs ↔ Git Boundary

The most important architectural boundary. These systems must never be conflated.

| Phase | Yjs | Git |
|-------|-----|-----|
| Active Session | Source of truth | Not involved |
| Auto-save (30s) | Snapshot to Postgres | Not involved |
| Session End (60s) | Final snapshot | Commit triggered |
| Named Version | - | Git tag created |

**Invariant:** No editing session ends without content being committed to Git within 65 seconds.

### Sync Gateway ↔ API Server Boundary

| Service | Can Touch |
|---------|-----------|
| Sync Gateway | Yjs state, Redis, internal API calls |
| API Server | PostgreSQL, Git, Meilisearch, S3, Redis |

Sync Gateway **never** writes to PostgreSQL directly. All persistence flows through Go API.

---

## Communication Flows

### Document Edit Flow

```
User A ──┐
         ├──► Sync Gateway ──► Redis Pub/Sub ──► Sync Gateway ──► User B
User B ──┘         │
                   ▼
              PostgreSQL (yjs_snapshots, yjs_updates_log)
                   │
         (60s after last disconnect)
                   ▼
              Go API (/internal/session-ended)
                   │
                   ▼
              Git Commit (content.md)
```

### Proposal Merge Flow

```
User clicks "Merge"
       │
       ▼
Go API validates approval chain
       │
       ▼
go-git performs three-way merge
       │
       ├──► Clean merge ──► Commit to main ──► Delete proposal branch
       │
       └──► Conflict ──► Block merge ──► Visual conflict UI
```

---

## Security Model

### Authentication Methods

| Method | Status | Implementation |
|--------|--------|----------------|
| Email + password | 🔄 AUTH-101 | bcrypt (cost 12) - IN PROGRESS |
| Google OAuth | ⬜ v1.0-stretch | OAuth 2.0 PKCE - P1 stretch goal |
| Magic link | ⬜ v1.1 | HMAC-signed, 15min TTL - Post v1.0 |
| SAML 2.0 SSO | ⬜ v2.0 | crewjam/saml - Moved to v2.0 |
| SCIM 2.0 | ⬜ v2.0 | User/group provisioning - Moved to v2.0 |

### Current Auth Reality
Current implementation uses display-name-only demo auth. Real email/password auth 
is required before SSO/SCIM can be meaningful.

See issues: #83 (AUTH-101), #84 (AUTH-102), #85 (RBAC-101), #86 (RBAC-102)

### Permission Model

#### Role Hierarchy (Implemented — RBAC-101)

| Role | Read | Comment | Suggest | Write | Approve | Admin |
|------|------|---------|---------|-------|---------|-------|
| **Viewer** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Commenter** | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Suggester** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Editor** | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Admin** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Permission Enforcement:**
- All API routes are guarded by `rbac.Can()` checks (RBAC-101)
- Permission denials are logged to `permission_denials` table for audit
- Centralized `forbid()` helper returns standardized 403 responses
- **Space visibility enforcement:** Restricted spaces are hidden from non-members. `ListAccessibleSpaceIDs(userID, role)` returns organization-visible spaces plus restricted spaces where the user has a grant in `mv_effective_permissions`. Admins see all spaces. Applied at `GET /api/workspaces` and `GET /api/spaces/{id}/documents`.

#### Document-Level Permissions (Implemented — RBAC-102)

Document permissions override workspace-level roles via `document_permissions` table:
- `GetEffectiveRole()` resolves: document_permissions → workspace_memberships → no access
- Supports time-limited grants (`expires_at`)
- External users without explicit document grants get no access
- API endpoints: `GET/POST /api/documents/{id}/permissions`, `DELETE /api/documents/{id}/permissions/{userId}`

**Permission Granularity:**
- **Read**: View documents, see version history, compare
- **Comment**: Add annotations, replies, vote, react
- **Suggest**: Propose tracked changes (future: suggestion mode)
- **Write**: Create/edit documents, proposals, resolve threads
- **Approve**: Approve proposals, merge
- **Admin**: Manage permissions, delete spaces, manage document access

#### User Types

| Type | Scope | Authentication | @Mentions |
|------|-------|----------------|-----------|
| **Internal** | Full workspace | Email/Password, OAuth, SAML | All members |
| **Guest** | Single space only | Magic link | Guests in same space only |
| **Anonymous** | Specific document | None (public link) | N/A |

**Guest User Restrictions:**
- Cannot access people directory
- Cannot see internal threads (enforced by RLS)
- Cannot create spaces or invite others
- @Mentions limited to other guests in same space

#### Sharing Modes

| Mode | Access | Use Case |
|------|--------|----------|
| **Private** | Owner only | Personal drafts |
| **Space Members** | Inherits space permissions | Team documents |
| **Invite Only** | Named individuals | Sensitive docs, client collaboration |
| **Public Link** | Anyone with link (optional password/expiry) | Published docs, auditor access |

#### Internal vs External Thread Visibility

| Visibility | Visible To | Use Case |
|------------|------------|----------|
| **Internal** (default) | Workspace members only | Team deliberation |
| **External** | Explicitly shared guests | Client communication |

**Enforcement:** Database RLS + API filtering + Sync Gateway filtering

### Row-Level Security (v1.1)

All PostgreSQL queries run with RLS enabled:

```sql
SET LOCAL app.current_user_id = '<uuid>';
SET LOCAL app.is_external = 'true/false';
```

**RLS Policies by Table:**

| Table | Policy | Effect |
|-------|--------|--------|
| `threads` | `threads_visibility` | External users cannot see `INTERNAL` threads |
| `documents` | `documents_access` | Users can only see documents they have `view` permission on |
| `annotations` | `annotations_access` | Inherits visibility from parent thread |
| `decision_log` | `decision_log_readonly` | Append-only; no UPDATE/DELETE |

**External users (`is_external=true`)** are automatically excluded from INTERNAL threads at the database layer.

### Permission Service Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RBAC SERVICE (Implemented)                 │
│                      (Go - internal/rbac + internal/app)     │
├─────────────────────────────────────────────────────────────┤
│  rbac.Can(role, action) → bool                               │
│  service.Can(role, action) → bool                            │
│  service.CanForDocument(ctx, userID, docID, action) → bool   │
│  service.LogPermissionDenial(ctx, denial)                    │
├─────────────────────────────────────────────────────────────┤
│  Source of Truth:                                            │
│  - workspace_memberships (workspace-level roles)             │
│  - document_permissions (document-level overrides)           │
│  - permission_denials (audit log)                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment

### Docker Compose Stack

```yaml
services:
  api:           # Go binary — Chronicle API server (includes chromium + pandoc for export)
  sync:          # Node.js — Yjs Sync Gateway
  postgres:      # PostgreSQL 16 with persistent volume
  redis:         # Redis 7 — sessions, pub/sub, rate limiting
  meilisearch:   # Meilisearch — full-text search
  minio:         # MinIO — S3-compatible object store
  caddy:         # Reverse proxy — TLS termination, routing
```

### Upgrade Strategy

- All migrations ship with forward and rollback scripts
- Migrations run automatically on startup (golang-migrate)
- Standard upgrades are non-destructive (zero downtime)
- Breaking changes explicitly flagged

---

## Build Sequence (Milestones)

| Milestone | Status | Unblocks |
|-----------|--------|----------|
| M1: Foundation | ⬜ | Everything |
| M2: Core Editor | ⬜ | Real-time, diff, deliberation |
| M3: Real-time | ⬜ | Concurrent editing, presence |
| M4: Version Control | ⬜ | Review workflow, approvals |
| M5: Deliberation | ⬜ | Approval system, client portal |
| M6: Approvals | ⬜ | Enterprise governance |
| M7: Permissions | ⬜ | Enterprise sales |
| M8: Search & Polish | ⬜ | User adoption |
| M9: Enterprise | ⬜ | Enterprise deals |
| M10: Integrations | ⬜ | Ecosystem, developer adoption |

### v2.0+ Features (Post-v1.0)

| Milestone | Status | Unblocks |
|-----------|--------|----------|
| M11: API Platform | ⬜ | Third-party integrations, ecosystem |

**Notes:** REST API v1 and Webhook contracts (RM-006) moved to v2.0 for further specification.

---

## Maintenance Checklist

When making structural changes, update this document:

- [ ] **New service added?** → Update Service Architecture section
- [x] **New database table?** → Update Data Stores → PostgreSQL tables (document_permissions, email_verifications, password_resets)
- [x] **Directory structure changed?** → Updated Directory Structure section (added src/ui, src/views, src/editor, src/lib, src/state)
- [x] **API endpoint removed?** → Removed `/api/documents/{id}/blame` endpoint; contributor attribution now part of History tab (derived from commit data, no API needed)
- [x] **Security model changed?** → Update Security Model section (Auth v1.0 reality check)
- [ ] **Deployment changed?** → Update Deployment section
- [x] **Milestone completed?** → Update Build Sequence status (SSO/SCIM→v2.0)
- [x] **Developer handoff created?** → Created `docs/HANDOFF_PERMISSIONS_SHARING.md` documenting schema-complete, API-pending status for permissions system

- [x] **Security model changed?** → Updated Permission Model section with RBAC v1.1 details, user types, sharing modes, and thread visibility
- [x] **New database table?** → Added `permission_denials` (RBAC-101 audit), `document_permissions` (RBAC-102)
- [x] **Security model changed?** → Updated Permission Model to reflect implemented RBAC-101/102: enforced role hierarchy with suggester, document-level permissions, permission denial audit logging
- [x] **New API endpoint pattern?** → Added `/api/documents/{id}/permissions` endpoints (GET/POST/DELETE) for document permission management
- [x] **New API endpoint pattern?** → Added admin endpoints: `/api/admin/users` (GET), `/api/admin/users/{id}/role` (PUT), `/api/admin/users/{id}/status` (PUT)
- [x] **New API endpoint pattern?** → Added group endpoints: `/api/groups` (GET/POST), `/api/groups/{id}` (GET/PUT/DELETE), `/api/groups/{id}/members` (GET/POST), `/api/groups/{id}/members/{userId}` (DELETE)
- [x] **New database table?** → Added `visibility` column to `spaces` table (migration 0021)
- [x] **Directory structure changed?** → Added `src/views/settings/` for Settings page tab components
- [x] **New API endpoint pattern?** → Extended `PUT /api/spaces/{id}` to accept `visibility` field; all space list/detail responses now include `visibility`
- [x] **New API endpoint pattern?** → Added `GET /api/documents/{id}/share/search?q=...` for user/group search in ShareDialog; extended `POST /api/documents/{id}/permissions` to accept `subjectType`+`subjectId` for direct group/user grants
- [x] **New API endpoint pattern?** → Added `PUT /api/documents/{id}` for renaming documents (title update via sidebar context menu)
- [x] **New API endpoint pattern?** → Added trash/soft-delete endpoints: `DELETE /api/documents/{id}` (soft delete), `POST /api/documents/{id}/restore`, `POST /api/documents/{id}/purge`, `GET /api/trash` (all admin-only)
- [x] **New database table?** → Added `deleted_at` column to `documents` table (migration 0022) with partial index for trash listing
- [x] **New service added?** → Added `internal/storage` package (MinIO/S3 client for image uploads)
- [x] **New API endpoint pattern?** → Added `POST /api/documents/{id}/uploads` (image upload) and `GET /api/uploads/{key}` (serve uploaded files)
- [x] **Deployment changed?** → Added S3 environment variables to docker-compose API service; API now depends on MinIO service
- [x] **New API endpoint pattern?** → Added `?view=published` query param to `GET /api/workspace/{id}` to skip proposal detection and return main branch content read-only
- [x] **Security model changed?** → Added space visibility enforcement: `ListAccessibleSpaceIDs` filters restricted spaces from non-members at `GET /api/workspaces` and `GET /api/spaces/{id}/documents`

## Related Documents

### Permissions & Sharing
- 🆕 **[Developer Handoff: Permissions & Sharing](../HANDOFF_PERMISSIONS_SHARING.md)** - Current implementation status and roadmap
- [Auth & Permissions v1.0 Design](../specs/auth-permissions-v1.md)
- [Role & User Management Spec](../specs/role-user-management-spec.md)
- [Role & User Management Tickets](../specs/role-user-management-tickets.md)

### Core Architecture
- [Technical Architecture (Full)](../agent-memory/Chronicle_Technical_Architecture.txt)
- [Product Vision](../agent-memory/Chronicle_Product_Vision_v2.txt)
- [Agent README](../agent-memory/README.md)

After updating, set **Last Updated** date at top of file.

---

## Related Documents

- [Technical Architecture (Full)](../agent-memory/Chronicle_Technical_Architecture.txt)
- [Product Vision](../agent-memory/Chronicle_Product_Vision_v2.txt)
- [Agent README](../agent-memory/README.md)
