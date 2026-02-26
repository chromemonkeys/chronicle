# Chronicle Full Tech Spec Implementation Plan

## Context
- We are shifting from prototype implementation to the full architecture defined in `docs/agent-memory/Chronicle_Technical_Architecture.txt`.
- This plan is organized as parallel lanes with explicit ownership, dependencies, and handoff artifacts.
- This plan supersedes the earlier 2-week prototype integration plan.
- Each lane has exactly one accountable owner (one person per lane).

## Non-negotiable architecture targets
- API server implemented in Go (business logic, permissions, approvals, decision log, Git workflows).
- Real-time sync gateway implemented in Node.js with Yjs + `y-websocket`.
- Git operations implemented via `go-git` in Go (no shell-out Git dependency for core workflows).
- Data services: PostgreSQL, Redis, Meilisearch, MinIO (or S3-compatible).
- Self-host baseline must run via Docker Compose.

## Program success criteria
- End-to-end Chronicle document lifecycle works: create/edit -> propose -> review -> approve -> merge -> decision log.
- Version history is Git-native: branch proposals, commit history, named versions (tags), diff rendering, merge gate enforcement.
- Internal vs external thread visibility is enforced at API and data layers.
- Critical user journeys are covered by automated tests and CI gates.
- Full handoff docs exist per lane with zero implicit behavior.

## Lane map (parallel workstreams)

### Lane A: Platform and environment foundation
Owner: Lane A Engineer
Status: Not Started
Scope:
- Establish production-like local stack (`api`, `sync`, `postgres`, `redis`, `meilisearch`, `minio`, `caddy`).
- Standardize env config, secrets strategy, and local bootstrap scripts.
- Add observability baseline (structured logs, request IDs, service health checks).
Deliverables:
- `docker-compose.yml` and `.env.example` aligned with architecture.
- Service-level health/readiness endpoints and startup checks.
- Runbook: local setup, reset, backup/restore basics.
Depends on:
- None (starts immediately).

### Lane B: Data model, migrations, and policy enforcement
Owner: Lane B Engineer
Status: Not Started
Scope:
- Implement core schema for users, spaces, documents, branches, threads, annotations, approvals, decision log, audit log, Yjs snapshots.
- Create forward/rollback migrations.
- Implement database constraints for immutability and governance requirements.
Deliverables:
- Migration set with rollback coverage.
- Seed fixtures for local and CI test environments.
- DB policy tests (including decision-log immutability behavior).
Depends on:
- Lane A runtime stack.

### Lane C: Auth, sessions, RBAC, and sharing
Owner: Lane C Engineer
Status: Not Started
Scope:
- Implement auth flows (email/password + initial OAuth path), JWT access/refresh token lifecycle.
- Implement RBAC and sharing modes (private, space members, invite only, public link baseline).
- Enforce external-user restrictions in API behavior.
Deliverables:
- Auth/session APIs with contract docs.
- Permission evaluation module with unit tests.
- Access matrix test suite for core roles.
Depends on:
- Lane B schema.

### Lane D: Git/version-control engine and proposal workflows
Owner: Lane D Engineer
Status: Phase 2 Complete (MVP)
Scope:
- Implement document repo lifecycle (one repo per document), branch create/switch/merge flow.
- Implement commit pipeline and named versions (Git tags).
- Implement inline/split diff generation for document history and proposals.
- Implement merge gating pre-checks (required approvals + open thread checks).
Deliverables:
- Go Git service package with interfaces + tests.
- APIs for history, compare, branch proposals, and merge operations.
- Compatibility notes for commit/tag conventions.
Depends on:
- Lane B schema and Lane C auth/permissions.
Notes:
- This lane owns full version history implementation.

### Lane E: Real-time collaboration gateway (Yjs)
Owner: Lane E Engineer
Status: Phase 2 Complete (MVP)
Scope:
- Build `sync` service with Yjs doc lifecycle and websocket auth.
- Persist Yjs snapshots/updates and fire session-ended events to API.
- Implement Redis pub/sub coordination for multi-instance sync support.
Deliverables:
- Node sync gateway service with documented internal API contract.
- Snapshot/update persistence flow and recovery behavior tests.
- Session-end flush event contract with API team.
Depends on:
- Lane A stack, Lane C token validation contract, Lane B snapshot tables.

### Lane F: Editor, document UX, and client integration
Owner: Lane F Engineer
Status: Phase 2 Complete (MVP)
Scope:
- Implement the WYSIWYG editor stack with TipTap + ProseMirror as the primary editor runtime.
- Add Chronicle-specific ProseMirror plugins (anchors, diff decorations, suggestion/review behaviors).
- Integrate editor state with real-time collaboration contract (`y-prosemirror` with Lane E sync gateway).
- Integrate live APIs for documents, workspace, history, approvals, and proposal actions.
- Implement proposal/review states, diff modes, approval panels, and decision log UI against real contracts.
Deliverables:
- TipTap + ProseMirror editor baseline in production app route (not mock-only).
- Plugin package for Chronicle editor extensions with tests.
- Editor-to-sync integration contract tests with Lane E.
- Frontend API client aligned with finalized backend contracts.
- Workspace/document/approval flows fully live-backed.
- Accessibility and responsive acceptance pass for core views.
Depends on:
- Lane C auth APIs, Lane D history/proposal APIs, Lane G deliberation/approval APIs, Lane E realtime APIs.

### Lane G: Deliberation, threads, approvals, and decision log
Owner: Lane G Engineer
Status: Phase 2 Primitives Complete
Scope:
- Implement thread lifecycle (OPEN, RESOLVED, ORPHANED) and resolution outcomes.
- Implement approval chains, sign-off records, and hard merge gate enforcement.
- Implement decision-log entry generation on thread resolution.
- Enforce internal vs external thread visibility end-to-end.
Deliverables:
- Deliberation + approvals API module with tests.
- Decision-log query APIs and filter support.
- Audit trail events for approvals and thread resolutions.
Depends on:
- Lane B schema, Lane C permissions, Lane D merge flow.

### Lane H: Search, indexing, imports, and exports
Owner: Lane H Engineer
Status: Not Started
Scope:
- Index document and deliberation artifacts in Meilisearch with fallback behavior.
- Implement export surfaces (PDF, Markdown, DOCX baseline) and import baseline scope.
- Ensure search and exports obey role/visibility constraints.
Deliverables:
- Search indexing pipeline and query APIs.
- Export endpoints and fixtures.
- Import scope doc and initial importer skeleton.
Depends on:
- Lane B schema, Lane C permissions, Lane D document model.

### Lane I: QA automation, CI/CD, and release governance
Owner: Lane I Engineer
Status: Not Started
Scope:
- Build automated tests for critical journeys and governance rules.
- Add CI gates for unit/integration/e2e, lint, typecheck, and migration checks.
- Define release checklist and rollback verification steps.
Deliverables:
- E2E suite: auth, documents, workspace, proposals, approvals, merge gate, history.
- CI workflow with blocking checks.
- Defect triage template and release signoff checklist.
Depends on:
- Lanes C, D, F, G producing stable contracts and selectors.

## Dependency order and parallelization model
- Sequential foundation: Lane A -> Lane B -> Lane C.
- Core engine sequence: Lane D starts after C baseline auth/permission hooks exist.
- Realtime sequence: Lane E can begin after A/B/C contract alignment.
- UX sequence: Lane F can continue in parallel with mocks, then switch route-by-route as D/E/G APIs stabilize.
- Governance sequence: Lane G starts after B/C and integrates tightly with D.
- System hardening: Lane H and Lane I run continuously once first stable APIs exist.

## Milestone schedule (12-week implementation window)

### Phase 1 (Weeks 1-2): Foundation
- Lane A: stack + environment bootstrap complete.
- Lane B: schema + migrations for core entities complete.
- Lane C: auth/session + baseline RBAC complete.
- Lane I: CI skeleton and initial smoke checks online.

## Architecture milestone mapping (from technical architecture doc)
- M1 Foundation -> Lane A + Lane B + Lane C + Lane I.
- M2 Core editor (TipTap + ProseMirror) -> Lane F (primary), with Lane E integration hooks.
- M3 Real-time collaboration (Yjs sync) -> Lane E (primary), with Lane F client integration and Lane B snapshot tables.
- M4 Version control (branch/proposal/merge/diff) -> Lane D (primary), with Lane G merge-gate rules and Lane F UI integration.

### Phase 2 (Weeks 3-5): Core document engine
- [x] Lane D: repository lifecycle, branching, commit, compare, named versions.
- [x] Lane F: API-backed document list + workspace + history surface.
- [x] Lane G: thread + approval primitives and first merge gate checks.
- [x] Lane E: websocket gateway MVP with authenticated sessions.

### Phase 3 (Weeks 6-8): Governance and realtime hardening
- Lane G: full approval chains and decision-log generation.
- Lane E: snapshot/update persistence and recovery flow.
- Lane F: proposal/review mode and diff workflows on live data.
- Lane I: e2e coverage for proposal-to-merge path.

### Phase 4 (Weeks 9-10): Search and external-quality features
- Lane H: search indexing/query + export baseline.
- Lane C/G: external visibility policy hardening.
- Lane I: policy regression and security tests.

### Phase 5 (Weeks 11-12): Stabilization and release
- All lanes: bug burn-down and performance fixes.
- Lane I: release candidate validation and rollback drills.
- Program: go/no-go checklist and production handoff pack.

## Handoff contracts (mandatory)
- API contracts must include:
  - request/response examples
  - required vs optional fields
  - auth requirements
  - status codes and machine-readable error `code`
- Realtime contracts must include:
  - websocket auth behavior
  - event schemas
  - reconnect/recovery semantics
- Git/version contracts must include:
  - branch naming conventions
  - commit message format
  - tag naming rules for named versions
- Breaking contract changes require same-day versioned documentation updates.

## Risks and mitigations
- Risk: implementation drifts from architecture (Go API + Node sync split).
  - Mitigation: architecture gate in PR review checklist.
- Risk: version-history correctness defects create trust issues.
  - Mitigation: Lane D golden tests for branch/merge/tag/diff invariants.
- Risk: internal/external visibility leakage.
  - Mitigation: policy tests at API + DB levels and dedicated e2e cases.
- Risk: frontend blocks on backend readiness.
  - Mitigation: keep contract mocks current and migrate endpoint-by-endpoint.

## Definition of done (full tech spec baseline)
- Go API and Node sync services run together in Docker Compose.
- Document version history is fully Git-native and user-visible through compare/history workflows.
- Proposal review and merge-gate flows enforce approvals + thread resolution.
- Decision log is generated and queryable from resolved deliberation.
- Internal/external visibility boundaries pass automated policy tests.
- CI blocks regressions across unit, integration, and e2e suites.
