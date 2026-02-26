# SPEC-002 Detailed Implementation Spec: Discussion and Decision Layer

## 1. Feature Metadata
- Feature name: Discussion and deliberation system
- Owner: Lane G
- Reviewers: Lane B, Lane C, Lane F
- Related tickets: `DISC-*` (defined in this spec)
- Target milestone: Phase 2 hardening + Phase 3 completion

## 2. Problem Statement
Current implementation has base thread listing and thread resolution, but does not fully implement the required product behavior for threaded discussions, annotation taxonomy, decision outcomes, visibility controls, and discovery workflows.

Primary gaps:
- Thread creation API contract is used by frontend but not implemented in Go HTTP routes.
- Reply-level persistence is missing (`annotations` table does not exist yet).
- Resolution outcome is hardcoded to `ACCEPTED` instead of client-selected outcome.
- Role model does not allow commenter write actions needed for discussion participation.
- Discussion event contracts (thread create/reply/resolve) are not represented in realtime layer.
- Search, inbox, and notifications for discussion artifacts are only partially defined.

## 3. Requirement Inventory

| Requirement ID | Requirement | Source |
|---|---|---|
| `DISC-001` | Block-anchored threads with durable node-ID anchors | Product Vision 4.3, Technical Architecture 3.2 |
| `DISC-002` | Threaded replies, mentions, reactions, and votes | Product Vision 4.3 |
| `DISC-003` | Annotation type classification and filterability | Product Vision 4.3 |
| `DISC-004` | Resolve thread with required outcome (`ACCEPTED/REJECTED/DEFERRED`) and optional rationale | Product Vision 4.3, Technical Architecture 6.2 |
| `DISC-005` | Decision log auto-generation on resolution and merge; append-only integrity | Product Vision 4.3, Phase 1 DB contracts |
| `DISC-006` | Merge gate blocks until required approvals complete and open threads are zero | Product Vision 4.4, Phase 2 state machine |
| `DISC-007` | Full thread lifecycle (`OPEN`, `RESOLVED`, `ORPHANED`) with explicit transitions | Technical Architecture 6.1 |
| `DISC-008` | Permission model for discussion actions by role | Product Vision 8.1 |
| `DISC-009` | Internal vs external thread visibility with explicit external marking | Product Vision 8.3, Technical Architecture 6.3 |
| `DISC-010` | Defense-in-depth visibility enforcement at DB, API, and client | Technical Architecture 6.3 |
| `DISC-011` | Discussion data model completeness (`threads`, `annotations`, `decision_log`) | Technical Architecture 3.1 |
| `DISC-012` | REST API coverage for list/create/reply/resolve/reopen/visibility/reactions/votes | Product Vision REST API + discussion features |
| `DISC-013` | Workspace discussion panel and state matrix behavior | Product Vision 6.1, Phase 2 UI matrix |
| `DISC-014` | Search/index over comments and decision logs with type/date/author filters | Product Vision 4.5 |
| `DISC-015` | My Desk surfacing documents with open discussion obligations | Product Vision 4.5 |
| `DISC-016` | Notification events for comment/reply/resolve and decision outcomes | Product Vision 4.8 |
| `DISC-017` | Audit and observability for discussion governance actions | Execution plan + architecture governance requirements |

## 4. Global API Contract Matrix

| Route | Method | Auth | Request Body | Success | Errors |
|---|---|---|---|---|---|
| `/api/documents/:id/proposals/:pid/threads` | `GET` | bearer + `read` | none | `{threads: ThreadDTO[]}` | `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads` | `POST` | bearer + `comment` | `{text,anchorLabel,anchorNodeId,visibility,type}` | `WorkspacePayload` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads/:tid/replies` | `POST` | bearer + `comment` | `{body,type?,mentions?}` | `WorkspacePayload` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads/:tid/resolve` | `POST` | bearer + `write` | `{outcome,rationale?}` | `WorkspacePayload` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads/:tid/reopen` | `POST` | bearer + `write` | `{reason}` | `WorkspacePayload` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads/:tid/visibility` | `PATCH` | bearer + `write` | `{visibility}` | `WorkspacePayload` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads/:tid/vote` | `POST` | bearer + `comment` | `{direction}` | `{threadId,votes,userVote}` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/threads/:tid/reactions` | `POST` | bearer + `comment` | `{emoji}` | `{threadId,reactions}` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/decision-log` | `GET` | bearer + `read` | query filters | `{items: DecisionLogItem[]}` | `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR` |

## 5. Global Data Model and Persistence Rules

### 5.1 Required schema changes
- Add migration `db/migrations/0002_discussion_feature.up.sql` and down migration.
- Add table `annotations`:
  - `id` (uuid pk), `thread_id`, `author_id`, `body`, `type`, `mentions_json`, `created_at`.
- Add table `thread_votes`:
  - composite unique on (`thread_id`, `user_id`), value `-1|1`.
- Add table `thread_reactions`:
  - composite unique on (`thread_id`, `user_id`, `emoji`).
- Extend `threads` with:
  - `anchor_offsets_json`, `type`, `resolved_outcome`, `orphaned_reason`, `updated_at`.
- Extend `decision_log` with:
  - `participants` population policy from `annotations.author_id` + `threads.created_by`.

### 5.2 Source-of-truth rules
- `threads` stores thread header + anchor + lifecycle state.
- `annotations` stores first comment and all replies.
- `decision_log` is append-only output of resolution/merge governance events.
- Frontend `WorkspacePayload.threads[].replies` is derived from `annotations`.

### 5.3 Idempotency and concurrency
- Thread resolution must be idempotent for repeated identical payloads.
- Vote route must be upsert-safe (`ON CONFLICT`) and deterministic.
- Reaction route must avoid duplicates by unique key.
- Use document-scoped transaction boundaries for state-changing thread actions.

## 6. Requirement Implementation Specs (Per Requirement)

### Fix DISC-001: Durable block anchors

### Problem
- Anchoring exists but is partially optional and not strictly enforced for all thread creates.

### Files
- `src/editor/extensions/node-id.ts`
- `src/editor/extensions/thread-markers.ts`
- `src/views/WorkspacePage.tsx`
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`

### Required Changes
- Enforce `anchorNodeId` required on thread creation unless explicit document-level thread mode is enabled.
- Persist both `anchor_node_id` and `anchor_offsets_json` for resiliency across edits.
- Add orphan detector on workspace load: if anchor node no longer exists, transition `OPEN -> ORPHANED`.

### Acceptance Criteria
- [ ] New threads always persist anchor identifiers.
- [ ] Anchor survives reorder/edit operations.
- [ ] Deleted anchor transitions thread to `ORPHANED`.

### Tests
- Unit: node-id assignment + anchor extraction.
- Integration: create thread with/without anchor node.
- E2E: move/edit block; thread remains correctly attached.

### Fix DISC-002: Threaded replies, mentions, reactions, votes

### Problem
- Current payload has replies UI field but no persistent reply model, no mention parsing, no vote/reaction routes.

### Files
- `db/migrations/0002_discussion_feature.up.sql`
- `api/internal/store/models.go`
- `api/internal/store/postgres.go`
- `api/internal/app/service.go`
- `api/internal/app/http.go`
- `src/api/types.ts`
- `src/api/client.ts`
- `src/ui/ThreadCard.tsx`

### Required Changes
- Implement `annotations` persistence and map to `WorkspaceThread.replies`.
- Add `POST .../replies`, `POST .../vote`, `POST .../reactions`.
- Parse mentions (`@Display Name`) into `mentions_json`.
- Return aggregated vote total and per-user vote state.

### Acceptance Criteria
- [ ] Replies persist and render after reload.
- [ ] Mention metadata is stored and returned.
- [ ] Upvote/downvote updates count deterministically.
- [ ] Reactions are de-duplicated per user+emoji.

### Tests
- Integration: reply create/read.
- Integration: vote toggling `+1 -> -1 -> remove`.
- Integration: reaction uniqueness.
- E2E: reply thread from discussion panel.

### Fix DISC-003: Annotation type system

### Problem
- Thread type is not fully enforced end-to-end; filtering by type is not wired.

### Files
- `db/migrations/0002_discussion_feature.up.sql`
- `api/internal/store/postgres.go`
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `src/api/types.ts`
- `src/views/WorkspacePage.tsx`

### Required Changes
- Enforce allowed types: `GENERAL|LEGAL|COMMERCIAL|TECHNICAL|SECURITY|QUERY|EDITORIAL`.
- Require type on thread creation (default `GENERAL`).
- Add list filters: `type`, `status`, `author`, `dateFrom`, `dateTo`.
- Expose type badges in thread card UI.

### Acceptance Criteria
- [ ] Invalid type returns `422 VALIDATION_ERROR`.
- [ ] Type filter returns only matching discussion records.
- [ ] UI shows type and filter chip states.

### Tests
- Contract tests for invalid/valid type values.
- E2E filter behavior with mixed-type fixtures.

### Fix DISC-004: Resolve with explicit outcome

### Problem
- Resolution path currently hardcodes `ACCEPTED` and ignores outcome payload.

### Files
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `src/api/client.ts`
- `src/ui/ThreadCard.tsx`

### Required Changes
- Parse `outcome` and optional `rationale` from resolve request.
- Enforce outcome enum and rationale-required for `REJECTED`.
- Persist `threads.resolved_outcome` and include in response payload.

### Acceptance Criteria
- [ ] Resolve request requires valid outcome.
- [ ] `REJECTED` without rationale is blocked with `VALIDATION_ERROR`.
- [ ] Thread UI shows outcome badge after resolution.

### Tests
- Integration: all three outcomes.
- Negative integration: invalid outcome, missing required rationale.

### Fix DISC-005: Decision log generation and immutability

### Problem
- Decision log insertion exists but with fixed rationale/outcome behavior and incomplete participant capture.

### Files
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `db/migrations/0001_phase1_core.up.sql`
- `src/ui/DecisionLogTable.tsx`

### Required Changes
- On each resolve, insert decision row from resolved payload and collect participants from annotation authors.
- On merge, insert merge decision event with governance rationale.
- Keep append-only DB rules (`decision_log_no_update`, `decision_log_no_delete`).

### Acceptance Criteria
- [ ] Every thread resolution inserts one decision row.
- [ ] Decision row includes outcome, rationale, resolver, commit hash, participants.
- [ ] Update/delete attempts on decision log remain blocked.

### Tests
- Integration: resolve -> decision log row.
- DB policy test: update/delete blocked.

### Fix DISC-006: Merge gate enforcement against open threads

### Problem
- Merge gate exists; must remain strict while expanding discussion lifecycle semantics.

### Files
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `src/views/WorkspacePage.tsx`

### Required Changes
- Count blockers as `status IN ('OPEN','ORPHANED')`.
- Merge remains blocked until pending approvals and open/orphaned threads are zero.
- Include blocker breakdown in `MERGE_GATE_BLOCKED.details`.

### Acceptance Criteria
- [ ] Merge fails with code `MERGE_GATE_BLOCKED` when blockers exist.
- [ ] UI shows blocker counts by category.

### Tests
- Integration: open thread blocked.
- Integration: orphaned thread blocked.
- E2E: blocked merge banner and disabled merge CTA.

### Fix DISC-007: Lifecycle state machine

### Problem
- ORPHANED is in schema but not fully transitioned by application logic.

### Files
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `src/api/types.ts`

### Required Changes
- Implement explicit transitions:
  - `OPEN -> RESOLVED`
  - `OPEN -> ORPHANED`
  - `ORPHANED -> RESOLVED`
  - `RESOLVED -> OPEN` (reopen route)
- Reject invalid transitions with `409 STATE_CONFLICT`.

### Acceptance Criteria
- [ ] Invalid transitions are blocked with deterministic code.
- [ ] Transition history is reflected in audit events.

### Tests
- Unit transition table tests.
- Integration for every valid and invalid transition.

### Fix DISC-008: Role permissions for discussion

### Problem
- Current RBAC denies commenter write actions, conflicting with discussion requirements.

### Files
- `api/internal/rbac/rbac.go`
- `api/internal/app/http.go`
- `api/internal/rbac/rbac_test.go`
- `docs/specs/PHASE-1_Foundation_Detailed_Spec.md` (contract update)

### Required Changes
- Add action `comment`.
- Permission matrix:
  - viewer: read
  - commenter: read + comment
  - editor/admin: read + comment + write + approve
- Apply `comment` checks on thread create/reply/react/vote routes.

### Acceptance Criteria
- [ ] Commenter can create/reply/react/vote.
- [ ] Commenter cannot resolve/merge.
- [ ] Viewer cannot mutate discussion.

### Tests
- RBAC unit matrix tests.
- Endpoint authz integration tests by role.

### Fix DISC-009: Internal/external visibility model

### Problem
- Visibility filter exists for reads but missing complete write-side controls and warnings.

### Files
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `src/views/WorkspacePage.tsx`
- `src/ui/ThreadComposer.tsx`

### Required Changes
- Default new thread visibility to `INTERNAL`.
- Allow internal users to mark thread `EXTERNAL`.
- External users may reply only when thread is `EXTERNAL`.
- Show pre-submit warning for `EXTERNAL` thread creation/reply.

### Acceptance Criteria
- [ ] External users never create internal threads.
- [ ] External users cannot read internal threads.
- [ ] Internal users see explicit external-visibility warning.

### Tests
- Integration: external user access matrix.
- E2E: external visibility warning modal/inline state.

### Fix DISC-010: DB/API/client defense-in-depth

### Problem
- Visibility behavior is currently query-filter based; must be enforced at all layers.

### Files
- `db/migrations/0002_discussion_feature.up.sql`
- `api/internal/store/postgres.go`
- `api/internal/app/service.go`
- `backend/sync.mjs`

### Required Changes
- Add RLS-compatible policy scaffold for external sessions on discussion tables.
- Keep API-layer filter guard for defense-in-depth.
- Prevent sync gateway from broadcasting internal thread events to external sessions.

### Acceptance Criteria
- [ ] Any one layer failure does not leak internal threads.
- [ ] External session payload never includes internal thread ids/bodies.

### Tests
- Integration: bypass attempts at route level fail.
- Realtime integration: external socket never receives internal thread event.

### Fix DISC-011: Data model completeness

### Problem
- Schema contains `threads` and `decision_log` but lacks normalized `annotations`, votes, reactions.

### Files
- `db/migrations/0002_discussion_feature.up.sql`
- `db/migrations/0002_discussion_feature.down.sql`
- `api/internal/store/models.go`
- `api/internal/store/postgres.go`

### Required Changes
- Introduce structs:
  - `Annotation`, `ThreadVote`, `ThreadReaction`
- Add store methods:
  - `CreateThread`, `CreateReply`, `ListThreadReplies`, `UpsertVote`, `UpsertReaction`
- Keep backward compatibility by still projecting `WorkspacePayload.threads[].replies`.

### Acceptance Criteria
- [ ] Schema supports normalized reply, vote, reaction persistence.
- [ ] Existing workspace payload remains backward compatible.

### Tests
- Migration up/down tests.
- Store integration tests for all new methods.

### Fix DISC-012: Full discussion API coverage

### Problem
- Frontend calls `POST .../threads` today, but Go API does not implement it.

### Files
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `src/api/client.ts`
- `src/api/types.ts`

### Required Changes
- Implement all routes in section 4 with stable status + `code`.
- Add typed domain errors for discussion actions.
- Remove route contract drift between frontend client and Go server.

### Acceptance Criteria
- [ ] No frontend discussion endpoint points to missing backend route.
- [ ] Error contracts are status+code stable and documented.

### Tests
- API contract tests per route (happy + negative paths).
- Frontend integration test against Go API responses.

### Fix DISC-013: Discussion panel UX state machine

### Problem
- Workspace has panel toggles but must enforce deterministic states from live data and action outcomes.

### Files
- `src/views/WorkspacePage.tsx`
- `src/ui/ThreadList.tsx`
- `src/ui/ThreadCard.tsx`
- `src/ui/ThreadComposer.tsx`

### Required Changes
- Replace manual demo state toggles with data-driven state:
  - loading, ready, empty, error.
- Add per-action busy/error states:
  - create comment, reply, resolve, vote.
- Keep active-thread selection stable after live refresh.

### Acceptance Criteria
- [ ] Panel state always reflects API lifecycle.
- [ ] Action errors are visible inline, not only `window.alert`.

### Tests
- Component tests for state transitions.
- E2E: create/reply/resolve with API failures.

### Fix DISC-014: Search and filtering over discussion artifacts

### Problem
- Product requires search over comments and decision logs with filters; implementation currently does not expose discussion query API.

### Files
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `src/ui/DecisionLogTable.tsx`

### Required Changes
- Implement `/api/documents/:id/decision-log` with query filters.
- Include annotation type, author, date range, outcome filters.
- Return pagination metadata (`cursor`, `hasMore`).

### Acceptance Criteria
- [ ] Filter combinations return deterministic subsets.
- [ ] Decision log view supports query-driven filtering.

### Tests
- Integration filter matrix tests.
- E2E decision-log filter scenarios.

### Fix DISC-015: My Desk open-thread obligations

### Problem
- Inbox requirement exists but open-thread obligations are not exposed as dedicated API contract.

### Files
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `src/views/DocumentsPage.tsx`

### Required Changes
- Add endpoint `/api/me/desk` returning:
  - docs awaiting review
  - docs with user-open threads
  - recently active docs
- Include thread counts and latest activity timestamp.

### Acceptance Criteria
- [ ] User sees docs where they have unresolved participation.
- [ ] Counts match thread/approval backing data.

### Tests
- Integration: desk payload assembly.
- E2E: desk cards update after resolution.

### Fix DISC-016: Notifications for discussion events

### Problem
- Product requires comment/resolution notifications; only partial notification behavior is specified.

### Files
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`
- `docs/runbooks/local-stack.md`

### Required Changes
- Emit internal event records for:
  - thread_created
  - reply_added
  - thread_resolved
  - merge_gate_unblocked
- Send webhook payloads for comment/reply/resolve.
- Add Slack/Teams adapter contract (feature-flagged if provider unavailable).

### Acceptance Criteria
- [ ] Webhook subscribers receive deterministic event payloads.
- [ ] Notification retries are logged and observable.

### Tests
- Integration tests with webhook stub receiver.
- Retry/backoff tests for transient failures.

### Fix DISC-017: Audit and observability

### Problem
- Governance actions must be reconstructable; discussion actions need explicit audit and telemetry records.

### Files
- `api/internal/app/http.go`
- `api/internal/app/service.go`
- `api/internal/store/postgres.go`

### Required Changes
- Structured logs for all discussion mutation routes:
  - include request id, actor, document id, proposal id, thread id, outcome.
- Audit records for visibility changes and resolution outcomes.
- Metrics counters:
  - `threads_created_total`
  - `threads_resolved_total`
  - `threads_orphaned_total`
  - `merge_gate_blocked_total`

### Acceptance Criteria
- [ ] Every governance mutation creates log + audit record.
- [ ] Dashboard counters reflect real mutation volume.

### Tests
- Integration tests asserting audit rows for each mutation.
- Metric emission tests with in-memory recorder.

## 7. Test Plan Matrix

| Test ID | Level | Requirement Coverage | Scenario | Expected |
|---|---|---|---|---|
| `DISC-IT-001` | integration | `DISC-001`,`DISC-012` | create thread with anchor | thread persisted with anchor node |
| `DISC-IT-002` | integration | `DISC-002` | add reply with mentions | annotation row + mentions json saved |
| `DISC-IT-003` | integration | `DISC-002` | vote transitions | deterministic aggregate vote total |
| `DISC-IT-004` | integration | `DISC-004`,`DISC-005` | resolve with `REJECTED` + rationale | thread resolved + decision log row |
| `DISC-IT-005` | integration | `DISC-006` | merge with open thread | `409 MERGE_GATE_BLOCKED` |
| `DISC-IT-006` | integration | `DISC-007` | orphan transition after anchor delete | thread status becomes `ORPHANED` |
| `DISC-IT-007` | integration | `DISC-008`,`DISC-009` | commenter/external authz matrix | permissions enforced |
| `DISC-IT-008` | integration | `DISC-010` | external user thread read | no internal threads returned |
| `DISC-IT-009` | integration | `DISC-014` | decision log filter query | filtered items only |
| `DISC-E2E-001` | e2e | `DISC-013` | create->reply->resolve in workspace panel | deterministic UI states |
| `DISC-E2E-002` | e2e | `DISC-013`,`DISC-006` | blocked merge UX | blocker counts shown and merge disabled |
| `DISC-E2E-003` | e2e | `DISC-015` | My Desk after resolution | open-thread card count decreases |

## 8. PR Evidence Requirements
- Spec link in PR body: `docs/specs/SPEC-002_Discussion_Detailed_Implementation_Spec.md`.
- Route contract evidence:
  - request/response samples for each new route.
- Data-layer evidence:
  - migration up/down logs.
  - SQL proofs for decision log immutability.
- UI evidence:
  - workspace discussion panel state transitions.
  - decision-log filtering.
- Test evidence:
  - all `DISC-IT-*` and touched `DISC-E2E-*`.
- Out-of-scope list (mandatory):
  - explicitly list any `DISC-*` item not implemented in the PR.

## 9. Definition of Done
- [ ] All `DISC-*` requirements are either implemented or explicitly marked out-of-scope with rationale.
- [ ] No missing frontend/backend discussion route mismatches.
- [ ] Discussion lifecycle, merge gate, and decision log flows are covered by blocking automated tests.
- [ ] Internal/external discussion visibility is enforced at DB, API, and client layers.
- [ ] Reviewer verifies no scaffold-only completion and no placeholder logic in required paths.
