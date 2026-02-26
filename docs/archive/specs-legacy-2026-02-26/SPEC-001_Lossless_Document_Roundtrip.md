# SPEC-001: Lossless Rich Document Round-Trip

## 1. Feature Metadata
- Feature name: Lossless Rich Document Round-Trip
- Owner: TBD
- Reviewer(s): Backend lead, Frontend lead, QA lead
- Related issue/ticket: SPEC-001
- Target milestone: Next sprint

## 2. Problem Statement
- Current behavior: editor content is partially flattened to legacy fields (`title`, `subtitle`, `purpose`, `tiers`, `enforce`) during save/sync.
- Why this is incorrect: non-template ProseMirror nodes and attributes can be lost or overwritten.
- Impact: data loss, broken diff/history confidence, inconsistent behavior between save path vs realtime path.
- Reproduction:
  1. Add rich nodes (list, blockquote, code block, custom attrs) in editor.
  2. Save draft and refresh.
  3. Observe missing/normalized content not matching original node tree.

## 3. Scope
- In scope:
  - Make `doc` (full ProseMirror JSON) the canonical source of truth for write/read/sync paths.
  - Keep legacy flat fields as derived compatibility projection only.
  - Ensure API, sync gateway, and frontend all preserve `doc`.
- Out of scope:
  - New editor features or schema redesign.
  - Migration of historical data beyond compatibility read fallback.
- Non-goals:
  - Removing legacy fields immediately.
  - Rewriting history model or Git architecture.

## 4. Core Invariants (Must Hold)
- `doc` is never discarded on any write/sync/flush path.
- If `doc` exists, legacy fields are derived from `doc`, not vice versa.
- A save + reload round-trip preserves node order, node types, text, and relevant attrs.
- Realtime snapshot and document updates carry the same canonical `doc` used for persistence.

## 5. Backend Detailed Spec

### 5.1 Route Contract Matrix
| Route | Auth | Request Body | Success Response | Failure Responses | Notes |
|---|---|---|---|---|---|
| `GET /api/workspace/:documentId` | bearer | none | `WorkspacePayload` including `doc` when available | `401`, `404`, `500` | `doc` preferred over legacy |
| `POST /api/workspace/:documentId` | bearer | legacy fields + optional `doc` | updated `WorkspacePayload` with persisted `doc` | `400`, `401`, `404`, `422`, `500` | if `doc` present, derive legacy |
| `POST /api/internal/sync/session-ended` | internal token | snapshot with content + optional `doc` | `{ ok: true, ... }` | `401`, `404`, `422`, `500` | flush must persist canonical `doc` |

### 5.2 Required Function-Level Changes

#### Fix 1: API Save Path Must Persist Canonical `doc`
- Problem:
  - `POST /api/workspace/:documentId` may save only legacy fields or treat them as primary.
- Files:
  - `backend/server.mjs`
- Changes:
  - `workspace POST` handler: accept `body.doc` and treat it as primary when present.
  - `deriveLegacyFromDoc(doc)`: always derive legacy projection if `doc` exists.
  - `createCommit(...)`: commit content must include `doc`.
  - `buildWorkspace(...)`: response must include persisted `doc` and derived `nodeIds`.
- Acceptance Criteria:
  - [ ] Save request with `doc` returns same `doc` (structural deep equality).
  - [ ] Legacy fields in response match derivation from saved `doc`.
  - [ ] No save path drops `doc`.

#### Fix 2: Diff Logic Must Respect Canonical `doc`
- Problem:
  - Legacy-only field diff can miss meaningful rich-document changes.
- Files:
  - `backend/server.mjs`
- Changes:
  - `diffContent(from, to)`: compare `doc` JSON when present.
  - If `doc` exists in either side, mark change based on canonical doc comparison.
  - Legacy-only compare remains fallback for old records without `doc`.
- Acceptance Criteria:
  - [ ] Rich-node change with identical legacy fields still produces a diff.
  - [ ] Legacy-only historical records still compare correctly.

#### Fix 3: Sync Flush Must Persist `doc`
- Problem:
  - Session flush can persist snapshot content without full `doc`.
- Files:
  - `backend/server.mjs`
- Changes:
  - `parseSnapshotContent(...)`: parse `snapshot.doc` when present.
  - `POST /api/internal/sync/session-ended`: commit snapshot with `doc` payload.
  - If snapshot has `doc`, derive legacy fields before commit.
- Acceptance Criteria:
  - [ ] Session-ended payload with `doc` writes commit containing same `doc`.
  - [ ] Recovered commit from flush matches editor state.

## 6. Sync Gateway Detailed Spec

#### Fix 4: WebSocket Update + Snapshot Must Carry `doc`
- Problem:
  - Gateway may broadcast/persist only flat content.
- Files:
  - `backend/sync.mjs`
- Changes:
  - `handleDocumentUpdate(...)`: read `payload.doc` and include in room snapshot.
  - Persisted update log and snapshot file include `doc` when provided.
  - Outbound `document_update` and `snapshot` events include `doc` field.
  - `flushSession(...)`: include canonical `doc` in `snapshot` forwarded to API.
- Acceptance Criteria:
  - [ ] Incoming `doc_update` with `doc` is rebroadcast with same `doc`.
  - [ ] Snapshot replay after reconnect includes same `doc`.
  - [ ] Session flush forwards `doc` to API endpoint.

## 7. Frontend Detailed Spec

#### Fix 5: Editor State Must Be Source of Truth
- Problem:
  - Lossy conversion path can overwrite rich structure.
- Files:
  - `src/views/WorkspacePage.tsx`
  - `src/api/client.ts`
  - `src/api/types.ts`
- Changes:
  - `handleEditorUpdate(doc)`: `docDraft` is canonical; `contentDraft` is derived display/compat state.
  - `saveDraft()`: always send `docDraft` with `saveWorkspace(...)`.
  - Load path: prefer `payload.doc`; convert from legacy only if `doc` absent.
  - Realtime receive path: for `snapshot` and `document_update`, prefer `event.doc`.
- Acceptance Criteria:
  - [ ] Reload after save preserves full ProseMirror structure.
  - [ ] Realtime collaborator updates preserve rich nodes.
  - [ ] Legacy fallback still works when server returns no `doc`.

#### Fix 6: Sync Type Contracts Must Explicitly Include `doc`
- Problem:
  - Missing types allow silent dropping of `doc` at compile-time boundaries.
- Files:
  - `src/api/types.ts`
- Changes:
  - Extend `SyncEvent` union: `snapshot.snapshot.doc?: DocumentContent`, `document_update.doc?: DocumentContent`.
  - Ensure workspace payload typing includes optional canonical `doc`.
- Acceptance Criteria:
  - [ ] TypeScript flags event handlers that ignore required fields.
  - [ ] No `any` casts needed for `doc` in sync handlers.

## 8. Security + Governance
- Route auth unchanged and required.
- Internal sync endpoint continues token validation.
- Audit event for save/flush includes changed field list and commit hash.
- No sensitive payload logging beyond required operational metadata.

## 9. Observability
- Structured log events required:
  - `CONTENT_UPDATED` with `changedFields` and commit hash.
  - `SYNC_SESSION_FLUSHED` with session id, update count, commit hash.
- Add metric counters:
  - `workspace.save.with_doc`
  - `workspace.save.legacy_only`
  - `sync.flush.with_doc`
  - `sync.flush.legacy_only`

## 10. Test Plan (Required)

### Unit Tests
- `deriveLegacyFromDoc`:
  - heading/paragraph mapping
  - rich nodes ignored for legacy derivation without corrupting required fields
- `diffContent`:
  - detects `doc` change when legacy fields same
  - legacy-only compare fallback

### Integration Tests
- API:
  - `POST /api/workspace/:id` with `doc` persists and returns same `doc`
  - `GET /api/workspace/:id` returns canonical `doc`
  - `POST /api/internal/sync/session-ended` persists `doc` from snapshot
- Sync gateway:
  - `doc_update` frame with `doc` appears in rebroadcast and snapshot replay

### E2E Tests
- Create rich content, save, refresh, verify structure equality.
- Two-client realtime edit with list/code/blockquote, verify both clients retain full structure.
- Disconnect/reconnect, load snapshot, verify structure preserved.

### Negative Tests
- Missing `doc` still works through legacy fallback.
- Malformed `doc` returns validation error and does not commit.

## 11. PR Evidence Requirements
- PR must include:
  - spec link (`docs/specs/SPEC-001_Lossless_Document_Roundtrip.md`)
  - list of function-level changes with file references
  - test evidence for unit/integration/e2e
  - before/after payload examples showing `doc` round-trip
  - explicit out-of-scope list

## 12. Definition of Done (Hard Gate)
- [ ] All fix items above implemented end-to-end.
- [ ] No scaffolding-only code paths remain.
- [ ] Save, realtime, snapshot, and reload all preserve canonical `doc`.
- [ ] Required tests pass in CI.
- [ ] Reviewer confirms acceptance criteria with evidence.

