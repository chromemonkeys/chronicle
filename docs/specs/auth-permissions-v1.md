# v1.0 Auth & Permissions Design

## Current State (Demo)
- Display name only → session token
- No password, no email verification
- In-memory refresh tokens (lost on restart)
- Roles in schema but not enforced

## Target State (v1.0)

### 1. User Identity

```typescript
// User table (existing, needs activation)
users {
  id: UUID
  email: TEXT UNIQUE  // verified, primary identifier
  display_name: TEXT
  password_hash: TEXT  // bcrypt, nullable (for OAuth-only users)
  is_email_verified: BOOLEAN
  is_external: BOOLEAN  // for guest users
  mfa_enabled: BOOLEAN  // v1.1
  created_at, updated_at
}
```

**Sign-up flow:**
1. Email + password + display name
2. Verification email (6-digit code or link)
3. Account active after verification

**Sign-in flows:**
- Email + password → JWT + refresh token
- Google OAuth → find/create user → JWT + refresh token
- Magic link (optional) → email with signed URL

### 2. Role-Based Access Control (RBAC)

```typescript
// Roles (existing in schema - ACTIVATE THESE)
workspace_memberships {
  user_id: UUID → users
  role: 'viewer' | 'commenter' | 'editor' | 'admin'
  created_at
}

// Document-level permissions (NEW - needed for external guests)
document_permissions {
  document_id: TEXT → documents
  user_id: UUID → users  // null for role-based
  role: 'viewer' | 'commenter' | 'suggester' | 'editor' | 'admin'
  granted_by: UUID
  granted_at: TIMESTAMPTZ
  expires_at: TIMESTAMPTZ  // for time-limited access
}
```

**Role hierarchy:**
```
viewer → commenter → suggester → editor → admin
(Each level includes previous permissions)
```

**Permission matrix:**

| Action | Viewer | Commenter | Suggester | Editor | Admin |
|--------|--------|-----------|-----------|--------|-------|
| Read doc | ✅ | ✅ | ✅ | ✅ | ✅ |
| View history | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comment | ❌ | ✅ | ✅ | ✅ | ✅ |
| Suggest changes | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit doc | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage permissions | ❌ | ❌ | ❌ | ❌ | ✅ |
| Delete doc | ❌ | ❌ | ❌ | ❌ | ✅ |

### 3. API Enforcement

Every API route needs:

```go
// Middleware stack
1. JWT validation → user identity
2. Permission check → role for resource
3. Audit logging → who did what

// Example enforcement
canRead := permissions.Check(user, "document:read", docID)
canEdit := permissions.Check(user, "document:edit", docID)
```

### 4. Token Storage (Production-Ready)

Current: `Map<string, TokenData>` in memory
Target: Redis with TTL

```typescript
refresh_tokens:{[key: string]:  user_id: string;
  expires_at: number;
  issued_at: number;
  user_agent_hash: string;  // for binding detection
}  // TTL = expires_at - now()
}

revoked_access_tokens: {  // short TTL (token expiry time)
  [jti: string]: { revoked_at: number }
}  // TTL = token_expiry - now()
```

### 5. Row-Level Security (PostgreSQL)

```sql
-- Enable RLS on tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Policies check user's effective permissions
CREATE POLICY documents_access ON documents
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM document_permissions
    WHERE document_id = documents.id
    AND user_id = current_setting('app.current_user_id')::UUID
    AND (expires_at IS NULL OR expires_at > NOW())
  )
);
```

## Implementation Phases

### Phase 1: Basic Auth (P0 - Required for v1.0)
- [ ] Email/password sign-up with verification
- [ ] Email/password sign-in
- [ ] Password reset flow
- [ ] Redis-based refresh token storage
- [ ] Token revocation endpoint
- [ ] Protected route middleware (enforce login)

### Phase 2: RBAC Foundation (P0 - Required for v1.0)
- [ ] Workspace role assignment
- [ ] Permission middleware on all routes
- [ ] Document-level permission grants
- [ ] External guest invitations
- [ ] Internal vs external thread visibility enforcement

### Phase 3: OAuth (P1 - v1.0 Stretch)
- [ ] Google OAuth sign-in
- [ ] Account linking (email + OAuth same user)

### Phase 4: Enterprise Auth (v2.0)
- [ ] SAML 2.0 / OIDC
- [ ] SCIM provisioning
- [ ] MFA / TOTP

## New Issues to Create

1. **AUTH-101**: Email/password authentication with verification
2. **AUTH-102**: Redis-based session storage
3. **RBAC-101**: Permission middleware and enforcement
4. **RBAC-102**: Document-level access control
5. **RBAC-103**: External guest invitation flow
6. **AUTH-103**: Google OAuth integration (P1)

## Schema Changes Required

```sql
-- Activate existing tables (add missing columns)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;

-- New table for password resets
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- New table for email verification
CREATE TABLE email_verifications (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Document permissions (new table)
CREATE TABLE document_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'suggester', 'editor', 'admin')),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(document_id, user_id)
);
```
