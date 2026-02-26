# PHASE-1 Implementation Spec: Foundation (Weeks 1-2)

## 1. Scope and Source Mapping
- Execution plan phase: `Phase 1 (Weeks 1-2)`
- Architecture milestone: `M1 Foundation`
- Lanes in scope: `Lane A`, `Lane B`, `Lane C`, `Lane I`
- Canonical references:
  - `docs/agent-memory/Chronicle_Technical_Architecture.txt`
  - `Execution_Plan.md`

## 2. Phase Objective
Ship a production-shaped baseline that unblocks all later milestones by implementing:
- platform runtime and service orchestration
- schema/migration foundation with governance invariants
- auth/session plus baseline RBAC
- CI merge gates

## 3. Hard Completion Gates
- [ ] Docker compose starts `api`, `sync`, `postgres`, `redis`, `meilisearch`, `minio`, `caddy` and all are healthy.
- [ ] DB migrations run forward and rollback in CI.
- [ ] Auth/session contracts are implemented and documented with stable error codes.
- [ ] RBAC checks are enforced in handlers (not UI-only).
- [ ] CI blocks PR merges on failing required checks.

## 4. Implementation Contract Matrix

### 4.1 Service Runtime Contracts (Lane A)
| Item | Required Implementation | Required File(s) | Evidence |
|---|---|---|---|
| Compose services | Define all 7 baseline services with ports, env, health checks | `docker-compose.yml` | `docker compose ps` healthy output |
| Env contract | Required env vars + safe defaults documented | `.env.example` | doc review + startup success |
| Runbook | bootstrap/reset/backup/restore commands | `docs/runbooks/local-stack.md` | successful command transcript |
| API health checks | liveness and readiness endpoints | `api/internal/app/http.go` | integration tests |
| Sync health check | sync `/health` endpoint | `backend/sync.mjs` | curl response |

### 4.2 Data Layer Contracts (Lane B)
| Item | Required Implementation | Required File(s) | Evidence |
|---|---|---|---|
| Core tables | create core tables for users, sessions, docs, proposals, approvals, threads, versions, decision log | `db/migrations/0001_phase1_core.up.sql` | migration test |
| Rollback | full rollback script for migration | `db/migrations/0001_phase1_core.down.sql` | up/down CI job |
| Decision log immutability | DB rules block update/delete | `db/migrations/0001_phase1_core.up.sql` | SQL policy test |
| Validation constraints | enum/check constraints for statuses/roles | `db/migrations/0001_phase1_core.up.sql` | failing insert tests |
| Indexes | proposal/thread/decision hot-path indexes | `db/migrations/0001_phase1_core.up.sql` | query plan inspection |

### 4.3 Auth + RBAC Contracts (Lane C)
| Route | Method | Auth | Required Request | Required Success | Required Error Codes |
|---|---|---|---|---|---|
| `/api/session` | `GET` | optional bearer | none | `{authenticated,userName}` | `SERVER_ERROR` |
| `/api/session/login` | `POST` | none | `{name}` | `{token,refreshToken,userName}` | `INVALID_BODY`, `LOGIN_FAILED` |
| `/api/session/refresh` | `POST` | none | `{refreshToken}` | `{token,refreshToken,userName}` | `INVALID_BODY`, `UNAUTHORIZED` |
| `/api/session/logout` | `POST` | optional bearer | `{refreshToken?}` | `{ok:true}` | none (best-effort logout) |
| protected routes | mixed | required bearer | per-route | per-route | `UNAUTHORIZED`, `FORBIDDEN` |

### 4.4 CI Contracts (Lane I)
| Check | Command | Blocking | Required Location |
|---|---|---|---|
| web build | `npm run build` | yes | `.github/workflows/ci.yml` |
| api test | `go test ./...` | yes | `.github/workflows/ci.yml` |
| lint | repo lint command | yes | `.github/workflows/ci.yml` |
| typecheck | TS typecheck command | yes | `.github/workflows/ci.yml` |
| migration verify | up/down migration check | yes | `.github/workflows/ci.yml` or dedicated job |

## 5. Function-Level Implementation Checklist

### 5.1 API Server Functions
| File | Function | Requirement | Fail Condition |
|---|---|---|---|
| `api/internal/app/service.go` | `Bootstrap` | seeds baseline state only when database empty; initializes repos and initial proposal data | silently reseeds non-empty DB |
| `api/internal/app/service.go` | `Login` | normalize input and issue JWT + refresh token | empty username crashes or returns invalid token |
| `api/internal/app/service.go` | `Refresh` | rotate refresh token and issue new access token | accepts revoked/unknown refresh token |
| `api/internal/app/service.go` | `SessionFromToken` | parse, validate, check revoked access token | revoked token accepted |
| `api/internal/app/service.go` | `Logout` | revoke access token JTI and refresh token hash if provided | tokens remain active after logout |
| `api/internal/app/service.go` | `Can` | enforce action permission through RBAC module | handlers bypass `Can` |
| `api/internal/app/http.go` | `requireSession` | bearer required for protected routes; maps invalid/expired token to 401 | returns 500 for normal auth failure |
| `api/internal/app/http.go` | `withMiddleware` | assign request ID, set CORS headers, structured request logging | missing request ID in response/log |

### 5.2 RBAC Functions
| File | Function | Requirement | Fail Condition |
|---|---|---|---|
| `api/internal/rbac/rbac.go` | role normalization + `Can` | deterministic role/action matrix for read/write/approve/admin | case-sensitive role mismatch or over-permission |

### 5.3 Data Store Functions
| File | Function Group | Requirement | Fail Condition |
|---|---|---|---|
| `api/internal/store/postgres.go` | session persistence methods | refresh/access token revocation state is durable | revoked tokens accepted after restart |
| `api/internal/store/postgres.go` | document/proposal/approval/thread methods | enforce proposal-document linkage and status persistence | cross-document proposal mutation |

## 6. Detailed Acceptance Criteria

### 6.1 Platform
- [ ] `docs/runbooks/local-stack.md` commands work on clean checkout.
- [ ] `/api/health` and `/api/ready` are reachable through compose stack.
- [ ] sync gateway `/health` returns room count and `ok: true`.

### 6.2 Database
- [ ] migration up creates all baseline tables and constraints.
- [ ] migration down removes created objects cleanly.
- [ ] `decision_log` rejects update and delete operations.
- [ ] thread status and approval status check constraints reject invalid enum values.

### 6.3 Auth + RBAC
- [ ] login issues valid access and refresh tokens.
- [ ] refresh invalidates old refresh token.
- [ ] protected endpoint without token returns `401 UNAUTHORIZED`.
- [ ] protected endpoint with insufficient role returns `403 FORBIDDEN`.

### 6.4 CI
- [ ] failing web build blocks PR.
- [ ] failing go tests block PR.
- [ ] lint/typecheck/migration checks block PR when failing.

## 7. Test Case Matrix
| ID | Level | Scenario | Expected |
|---|---|---|---|
| `P1-AUTH-001` | integration | login with valid name | token + refreshToken returned |
| `P1-AUTH-002` | integration | refresh with revoked token | `401 UNAUTHORIZED` |
| `P1-AUTH-003` | integration | protected route without bearer | `401 UNAUTHORIZED` |
| `P1-RBAC-001` | unit | viewer write permission check | denied |
| `P1-RBAC-002` | unit | approver approve action check | allowed |
| `P1-DB-001` | integration | migration up/down on empty db | success |
| `P1-DB-002` | integration | update decision_log row | no-op/blocked by rule |
| `P1-OPS-001` | smoke | compose stack startup | all services healthy |
| `P1-CI-001` | pipeline | failing check in required job | PR blocked |

## 8. PR Evidence Requirements (Mandatory)
- Spec link in PR body: `docs/specs/PHASE-1_Foundation_Detailed_Spec.md`
- Change map linking every implemented item to file/function.
- Test evidence for all `P1-*` IDs touched.
- Runtime evidence:
  - health endpoint responses
  - migration up/down logs
  - auth error response samples with `code`
- Explicit list of out-of-scope items.

## 9. Definition of Done
- [ ] All Phase 1 checklist items are implemented and evidenced.
- [ ] No placeholder auth or RBAC bypass paths remain.
- [ ] Migrations are automated and rollback-capable.
- [ ] CI enforcement is active, not advisory.

