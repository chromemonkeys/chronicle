# Phase 1/2 Ticket Backlog (Ticket-Ready)

This backlog is generated directly from:
- `docs/specs/PHASE-1_Foundation_Detailed_Spec.md`
- `docs/specs/PHASE-2_Core_Document_Engine_Detailed_Spec.md`

## Ticket Field Definitions
- `Priority`: `P0` (blocker), `P1` (high), `P2` (normal)
- `Estimate`: engineering effort in ideal dev-days
- `Dependencies`: ticket IDs that should complete first
- `Spec Ref`: section in phase implementation specs

## Phase 1 Tickets

| Ticket ID | Title | Lane | Priority | Estimate | Dependencies | Scope (Implementation) | Definition of Done | Evidence Required |
|---|---|---|---|---|---|---|---|---|
| `P1-OPS-001` | Compose stack health baseline | Lane A | P0 | 1d | none | Ensure `api`, `sync`, `postgres`, `redis`, `meilisearch`, `minio`, `caddy` start healthy; verify `/api/health`, `/api/ready`, `/health` | Local stack starts cleanly and health checks pass | `docker compose ps`, curl responses, runbook proof |
| `P1-DB-001` | Migration up/down reliability | Lane B | P0 | 1.5d | none | Validate `db/migrations/0001_phase1_core.up.sql` and `.down.sql` on empty DB and rollback path | Up/down migration passes in CI and local | migration logs + CI job output |
| `P1-DB-002` | Decision log immutability enforcement | Lane B | P0 | 0.5d | `P1-DB-001` | Enforce and test `decision_log_no_update` / `decision_log_no_delete` rules | Update/delete against decision log is blocked | SQL test + failing mutation proof |
| `P1-AUTH-001` | Login session contract | Lane C | P0 | 1d | `P1-DB-001` | Implement/verify `POST /api/session/login` path and token issuance (`token`, `refreshToken`, `userName`) | Valid login returns expected contract | API test output + sample response |
| `P1-AUTH-002` | Refresh token revocation behavior | Lane C | P0 | 1d | `P1-AUTH-001` | Verify `POST /api/session/refresh` rejects revoked/invalid refresh token | Revoked refresh token returns `401 UNAUTHORIZED` | API test + error payload with code |
| `P1-AUTH-003` | Protected route auth gate | Lane C | P0 | 0.5d | `P1-AUTH-001` | Validate `requireSession` path for protected endpoints | Missing bearer token returns `401 UNAUTHORIZED` | integration test + sample error response |
| `P1-RBAC-001` | Viewer write denial | Lane C | P0 | 0.5d | `P1-AUTH-003` | Enforce RBAC deny for viewer on write endpoints (`workspace POST`, submit, resolve) | Viewer cannot perform write actions | unit + integration test traces |
| `P1-RBAC-002` | Approver action allow matrix | Lane C | P1 | 0.5d | `P1-RBAC-001` | Validate approver role can execute approval action path | Approver can call approvals endpoint; non-approver denied | RBAC unit tests + endpoint tests |
| `P1-CI-001` | CI blocking checks baseline | Lane I | P0 | 1d | `P1-DB-001`, `P1-AUTH-001` | Enforce blocking CI checks: web build, api tests, lint, typecheck, migration verify | PR cannot merge with failing required checks | CI workflow run links (pass/fail) |

## Phase 2 Tickets

| Ticket ID | Title | Lane | Priority | Estimate | Dependencies | Scope (Implementation) | Definition of Done | Evidence Required |
|---|---|---|---|---|---|---|---|---|
| `P2-GIT-001` | Proposal branch + commit flow | Lane D | P0 | 1.5d | `P1-DB-001`, `P1-RBAC-001` | Validate proposal branch creation and commit persistence via git service and API workflow | Proposal branch exists and head advances on save | integration test + repo history proof |
| `P2-GIT-002` | Merge gate blocked behavior | Lane D/G | P0 | 1d | `P2-GIT-001`, `P2-API-003` | Enforce merge block when approvals/threads incomplete; return `MERGE_GATE_BLOCKED` payload | Merge denied until gate clear | integration test + error payload evidence |
| `P2-GIT-003` | Named version tagging | Lane D | P1 | 1d | `P2-GIT-001` | Validate version creation path writes git tag + named version DB record | Named version appears in history and tag list | history API sample + tag evidence |
| `P2-API-001` | History main-branch query contract | Lane D/F | P0 | 0.5d | `P2-GIT-001` | Ensure `proposalId=main` returns main branch history with `proposalId=null` | History payload is deterministic for main | API test + response snapshot |
| `P2-API-002` | Compare validation errors | Lane D/F | P1 | 0.5d | `P2-GIT-001` | Enforce required `from` + `to` compare params and stable `VALIDATION_ERROR` | Missing params returns `422` with code | API test + error contract output |
| `P2-API-003` | Approval dependency guard | Lane G | P0 | 1d | `P1-RBAC-002` | Enforce legal blocked until security + architecture approvals; return `APPROVAL_ORDER_BLOCKED` | Dependency order cannot be bypassed | integration test + conflict details |
| `P2-SYNC-001` | Realtime broadcast contract | Lane E/F | P0 | 1d | `P2-GIT-001` | Verify `doc_update` -> `document_update` broadcast with canonical payload | Peer receives expected update event | sync integration test + frame logs |
| `P2-SYNC-002` | Reconnect snapshot recovery | Lane E/F | P0 | 1d | `P2-SYNC-001` | Ensure reconnect sends latest `snapshot` payload and client rehydrates | Reconnect restores latest document state | integration test + reconnect capture |
| `P2-SYNC-003` | Sync flush idempotency | Lane E/D | P0 | 1.5d | `P2-SYNC-001`, `P2-API-001` | Deduplicate `sessionId` in `/api/internal/sync/session-ended` handling | Duplicate flush produces no duplicate commit | service test + commit count proof |
| `P2-UI-001` | Editor save/reload preservation | Lane F | P0 | 1d | `P2-GIT-001`, `P2-SYNC-002` | Validate workspace editor save then reload retains full expected state | Reloaded editor matches saved state | e2e video/screenshot + assertion logs |
| `P2-UI-002` | Approval flow UI state wiring | Lane F/G | P1 | 0.75d | `P2-API-003` | Wire approval action busy/success states from API responses | UI transitions pending -> approved deterministically | UI integration test + screenshot |
| `P2-UI-003` | Merge blocked UX behavior | Lane F/G | P1 | 0.75d | `P2-GIT-002` | Surface merge gate blockers in UI (`pendingApprovals`, `openThreads`) | Blocked merge communicates reasons and stays disabled | e2e test + UI evidence |

## Suggested Sprint Ordering
1. Sprint A (Foundation blockers): `P1-OPS-001`, `P1-DB-001`, `P1-AUTH-001`, `P1-AUTH-003`, `P1-RBAC-001`, `P1-CI-001`
2. Sprint B (Foundation hardening): `P1-DB-002`, `P1-AUTH-002`, `P1-RBAC-002`
3. Sprint C (Core engine backend): `P2-GIT-001`, `P2-API-001`, `P2-API-002`, `P2-API-003`, `P2-GIT-002`, `P2-GIT-003`
4. Sprint D (Realtime + UX): `P2-SYNC-001`, `P2-SYNC-002`, `P2-SYNC-003`, `P2-UI-001`, `P2-UI-002`, `P2-UI-003`

## Issue Body Template (Copy/Paste)
```md
Title: <Ticket ID> - <Title>
Phase: <Phase 1 or Phase 2>
Lane: <Lane>
Priority: <P0/P1/P2>
Estimate: <Xd>
Dependencies: <IDs>
Spec Ref: <path + section>

Scope
- <implementation bullets>

Definition of Done
- <done bullet 1>
- <done bullet 2>

Tests
- Required IDs: <P1-* or P2-*>

Evidence
- <API/test/UI/log artifacts required>
```

