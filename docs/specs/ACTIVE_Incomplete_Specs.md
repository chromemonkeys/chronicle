# ACTIVE Incomplete Specs

Last consolidated: 2026-02-26

This is the single active source for incomplete implementation/spec work.
All prior spec-list artifacts were archived after this consolidation.

## 1) Lane Status Gaps (from `Execution_Plan.md`)

### Not started
- Lane A: Platform and environment foundation
- Lane B: Data model, migrations, and policy enforcement
- Lane C: Auth, sessions, RBAC, and sharing
- Lane H: Search, indexing, imports, and exports
- Lane I: QA automation, CI/CD, and release governance

### Partially complete
- Lane G: Deliberation, threads, approvals, and decision log (`Phase 2 Primitives Complete`)

## 2) Open Integration Checklist

Source: former `docs/LaneB_Backend_Integration_Checklist.md`
- [ ] Backend error payload includes stable machine-readable `code` field for all paths.
- [ ] Replace local auth fallback once backend uptime is guaranteed in dev/prod.

## 3) Open Phase Gates

### Phase 1 Foundation (open)
Source: former `docs/specs/PHASE-1_Foundation_Detailed_Spec.md`
- [ ] Compose stack health baseline fully verified (`api`, `sync`, `postgres`, `redis`, `meilisearch`, `minio`, `caddy`).
- [ ] DB migration up/down verification is enforced in CI.
- [ ] Auth/session contracts fully verified with stable error codes.
- [ ] RBAC checks verified in handlers (not UI-only).
- [ ] CI checks block merges on failure (including lint/typecheck/migration checks).

### Phase 2 Core Document Engine (open)
Source: former `docs/specs/PHASE-2_Core_Document_Engine_Detailed_Spec.md`
- [ ] Proposal lifecycle is fully end-to-end with audit-safe transitions.
- [ ] Realtime events are contract-stable and reconnect-safe.
- [ ] Workspace load/save round-trips canonical document content deterministically.
- [ ] Merge prechecks are fully server-enforced with stable conflict payloads.
- [ ] Critical flows have blocking automated tests.

## 4) Feature-Specific Open Specs

### SPEC-001 Lossless Document Roundtrip (open)
Source: former `docs/specs/SPEC-001_Lossless_Document_Roundtrip.md`
- [ ] End-to-end implementation of all listed fixes is complete.
- [ ] No scaffold-only code paths remain.
- [ ] Save/realtime/snapshot/reload preserve canonical `doc`.
- [ ] Required tests pass in CI.
- [ ] Reviewer acceptance evidence is complete.

### SPEC-002 Discussion and Decision Layer (open)
Source: former `docs/specs/SPEC-002_Discussion_Detailed_Implementation_Spec.md`
- [ ] `DISC-001` durable anchors and orphan handling.
- [ ] `DISC-002` threaded replies/mentions/reactions/votes persistence.
- [ ] `DISC-003` type system and deterministic filtering.
- [ ] `DISC-004` explicit outcome-based resolution + rationale validation.
- [ ] `DISC-005` decision-log completeness + immutability validation.
- [ ] `DISC-006` strict merge gate and blocker UI/details.
- [ ] `DISC-007` lifecycle transitions + audit history.
- [ ] `DISC-008` role permissions for discussion actions.
- [ ] `DISC-009` internal/external visibility behavior.
- [ ] `DISC-010` defense-in-depth visibility enforcement (DB/API/client).
- [ ] `DISC-011` normalized schema and backward compatibility.
- [ ] `DISC-012` route coverage and contract stability.
- [ ] `DISC-013` panel lifecycle/error-state UX correctness.
- [ ] `DISC-014` decision/discussion search and filter behavior.
- [ ] `DISC-015` “My Desk” unresolved participation surfacing.
- [ ] `DISC-016` notifications/webhook reliability and observability.
- [ ] `DISC-017` governance audit/metrics completeness.
- [ ] Blocking automated test coverage and no scaffold-only completion.

### UI Detailed Implementation Spec (open)
Source: `docs/specs/UI_Detailed_Implementation_Spec.md`
- [ ] Screen contracts completed for sign-in, documents, workspace, approvals, app shell, and not-found routes.
- [ ] Component contracts completed for shared UI and workspace-specific modules.
- [ ] Responsive behavior baseline verified for desktop/tablet/mobile widths.
- [ ] Accessibility baseline verified for keyboard/focus/labels/status text.
- [ ] UI unit/integration/e2e matrix implemented and passing in CI.

## 5) Remaining Audit Fix Set

Source: former `docs/Phase1-3_Audit_Fixes.md`
- [ ] Fix 1: main-branch history special-casing + tests
- [ ] Fix 2: approval ordering enforcement + tests
- [ ] Fix 3: sync session idempotency/document-proposal validation + tests
- [ ] Fix 4: submit-action RBAC enforcement + tests
- [ ] Fix 5: deterministic 404 for nonexistent thread resolution + tests
- [ ] Fix 6: canonical ProseMirror `doc` roundtrip behavior + tests
- [ ] Fix 7: git concurrency/merge correctness hardening + tests
- [ ] Fix 8: internal/external visibility enforcement + tests
- [ ] Fix 9: Go-targeted automated test alignment in CI
- [ ] Fix 10: stable machine-readable error contract standardization

## 6) Active Ticket Backlog

Canonical location: `docs/specs/ACTIVE_Ticket_Backlog.md`
- [ ] All new tickets must be added in `ACTIVE_Ticket_Backlog.md`.
- [ ] `P1-*`, `P2-*`, and `UI-*` ticket streams are tracked there.

## 7) Archive Policy

- This file is the only active incomplete-spec tracker.
- Archived files remain under `docs/archive/specs-legacy-2026-02-26/` for historical reference.
- New incomplete items should be added here, not in new parallel spec-list files.
