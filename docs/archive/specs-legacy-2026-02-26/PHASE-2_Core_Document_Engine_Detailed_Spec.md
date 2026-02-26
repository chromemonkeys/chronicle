# PHASE-2 Implementation Spec: Core Document Engine (Weeks 3-5)

## 1. Scope and Source Mapping
- Execution plan phase: `Phase 2 (Weeks 3-5)`
- Architecture milestones: `M2 Core editor`, `M3 Real-time`, `M4 Version control`
- Lanes in scope: `Lane D`, `Lane E`, `Lane F`, `Lane G`
- Canonical references:
  - `docs/agent-memory/Chronicle_Technical_Architecture.txt`
  - `Execution_Plan.md`

## 2. Phase Objective
Deliver a live-backed document engine with:
- Git-native repository, branch, compare, and version flows
- realtime sync with recoverable session flush
- editor/client integration on live API contracts
- governance primitives (threads, approvals, merge prechecks)

## 3. Hard Completion Gates
- [ ] Proposal lifecycle runs end-to-end through API routes with audit-safe state transitions.
- [ ] Realtime events are contract-defined, typed, and replay-safe on reconnect.
- [ ] Workspace load/save is deterministic and round-trips canonical document content.
- [ ] Merge prechecks are enforced server-side and return stable conflict payloads.
- [ ] Critical phase flows have blocking automated tests.

## 4. API Route Contract Matrix

| Route | Method | Auth | Request Body | Success Response | Error Codes |
|---|---|---|---|---|---|
| `/api/documents` | `GET` | bearer + `read` | none | `{documents: DocumentSummary[]}` | `UNAUTHORIZED`, `FORBIDDEN`, `SERVER_ERROR` |
| `/api/documents/:id` | `GET` | bearer | none | `{document: DocumentSummary}` | `NOT_FOUND`, `UNAUTHORIZED` |
| `/api/workspace/:id` | `GET` | bearer | none | `WorkspacePayload` | `NOT_FOUND`, `UNAUTHORIZED` |
| `/api/workspace/:id` | `POST` | bearer + `write` | `WorkspaceContent` (+ optional `doc`) | updated `WorkspacePayload` | `INVALID_BODY`, `FORBIDDEN`, `SERVER_ERROR` |
| `/api/documents/:id/history` | `GET` | bearer | query `proposalId?` | `DocumentHistoryPayload` | `NOT_FOUND`, `VALIDATION_ERROR` |
| `/api/documents/:id/compare` | `GET` | bearer | query `from,to` | `DocumentComparePayload` | `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals` | `POST` | bearer + `write` | `{title?}` | `WorkspacePayload` | `FORBIDDEN`, `SERVER_ERROR` |
| `/api/documents/:id/proposals/:pid/submit` | `POST` | bearer + `write` | none | `WorkspacePayload` | `FORBIDDEN`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/approvals` | `POST` | bearer + `approve` | `{role}` | `WorkspacePayload` | `FORBIDDEN`, `VALIDATION_ERROR`, `APPROVAL_ORDER_BLOCKED` |
| `/api/documents/:id/proposals/:pid/threads/:tid/resolve` | `POST` | bearer + `write` | optional outcome payload | `WorkspacePayload` | `FORBIDDEN`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/versions` | `POST` | bearer + `write` | `{name}` | `WorkspacePayload` | `VALIDATION_ERROR`, `NOT_FOUND` |
| `/api/documents/:id/proposals/:pid/merge` | `POST` | bearer + `approve` | none | `WorkspacePayload` | `MERGE_GATE_BLOCKED`, `FORBIDDEN`, `NOT_FOUND` |
| `/api/internal/sync/session-ended` | `POST` | internal token | `{sessionId,documentId,proposalId?,snapshot,...}` | `{ok,...}` | `UNAUTHORIZED`, `VALIDATION_ERROR`, `NOT_FOUND` |

## 5. Realtime Contract Matrix (Lane E + Lane F)

### 5.1 Client -> Sync Gateway
| Type | Required Fields | Optional Fields | Behavior |
|---|---|---|---|
| `doc_update` | `content` | `doc` | update room snapshot, append update log, broadcast `document_update` |

### 5.2 Sync Gateway -> Client
| Type | Required Fields | Optional Fields | Behavior |
|---|---|---|---|
| `connected` | `room`, `participants`, `userName` | `persistedUpdates` | sent after WS auth/room join |
| `presence` | `action`, `participants`, `userName` | none | sent on join/leave |
| `snapshot` | `snapshot.content` | `snapshot.doc`, `actor`, `updatedAt` | sent on connect if snapshot exists |
| `document_update` | `actor`, `at`, `content` | `doc` | broadcast from incoming `doc_update` |
| `message` | `from`, `payload`, `receivedAt` | none | fallback message channel |

### 5.3 Session Flush Contract
| Field | Required | Notes |
|---|---|---|
| `sessionId` | yes | idempotency key at API layer |
| `documentId` | yes | target document |
| `proposalId` | yes in current gateway room model | proposal branch context |
| `actor` | no | defaults to `Sync Gateway` |
| `updateCount` | no | telemetry only |
| `snapshot` | yes for commit | canonical content payload; include `doc` when available |

## 6. State Machines

### 6.1 Proposal State Machine
| State | Trigger | Next State | Guard |
|---|---|---|---|
| `DRAFT` | submit | `UNDER_REVIEW` | caller has `write` |
| `UNDER_REVIEW` | approve role | `UNDER_REVIEW` | approval prerequisites satisfied |
| `UNDER_REVIEW` | merge success | `MERGED` | pending approvals = 0 and open threads = 0 |
| `UNDER_REVIEW` | reject (future flow) | `REJECTED` | explicit reject action |

### 6.2 Thread State Machine
| State | Trigger | Next State | Guard |
|---|---|---|---|
| `OPEN` | resolve thread | `RESOLVED` | thread exists in proposal |
| `OPEN` | anchor deleted | `ORPHANED` | anchor no longer resolvable |
| `RESOLVED` | reopen (future) | `OPEN` | explicit reopen action |

### 6.3 Merge Gate
| Condition | Result |
|---|---|
| `pendingApprovals > 0` | merge blocked (`MERGE_GATE_BLOCKED`) |
| `openThreads > 0` | merge blocked (`MERGE_GATE_BLOCKED`) |
| both zero | merge allowed |

## 7. Function-Level Implementation Checklist

### 7.1 Go Service Layer
| File | Function | Requirement | Fail Condition |
|---|---|---|---|
| `api/internal/app/service.go` | `SaveWorkspace` | compute next content from payload + canonical doc handling, commit only on change | lossy save or spurious empty commit |
| `api/internal/app/service.go` | `History` | support `proposalId=main`, proposal branch, and active proposal fallback | main history lookup fails |
| `api/internal/app/service.go` | `Compare` | compare two commit hashes and return deterministic changed fields | hash lookup ambiguity |
| `api/internal/app/service.go` | `ApproveProposalRole` | enforce dependency graph and conflict payload with blocker roles | legal approval bypass before blockers |
| `api/internal/app/service.go` | `ResolveThread` | return not found when thread unchanged/missing; emit decision log entry | silent success for missing thread |
| `api/internal/app/service.go` | `MergeProposal` | enforce merge gate counts and only merge when clear | merge despite open blockers |
| `api/internal/app/service.go` | `HandleSyncSessionEnded` | validate session/document/proposal linkage and dedupe by sessionId | duplicate flush creates duplicate commit |

### 7.2 Go HTTP Layer
| File | Handler Path | Requirement | Fail Condition |
|---|---|---|---|
| `api/internal/app/http.go` | `handleWorkspace` | enforce write permission on POST | write without RBAC |
| `api/internal/app/http.go` | `handleDocuments` | validate query params (`from`, `to`, `proposalId`) | ambiguous compare/history behavior |
| `api/internal/app/http.go` | `handleProposalAction` | role-gated submit/approvals/merge/versions/thread-resolve actions | unauthorized action allowed |

### 7.3 Git Service Layer
| File | Function | Requirement | Fail Condition |
|---|---|---|---|
| `api/internal/gitrepo/service.go` | `EnsureDocumentRepo` | initialize repo with baseline content and main ref | invalid HEAD/main refs |
| `api/internal/gitrepo/service.go` | `EnsureBranch` | create proposal branch from source branch | branch points to wrong commit |
| `api/internal/gitrepo/service.go` | `CommitContent` | commit content atomically under document lock | race corrupts repo state |
| `api/internal/gitrepo/service.go` | `CreateTag` | create idempotent named version tag | tag creation failure unrecoverable |
| `api/internal/gitrepo/service.go` | `MergeIntoMain` | write merge provenance in commit message | merge commit lacks source metadata |

### 7.4 Sync Gateway
| File | Function | Requirement | Fail Condition |
|---|---|---|---|
| `backend/sync.mjs` | `handleDocumentUpdate` | persist and broadcast content (+ optional doc) | doc dropped in broadcast |
| `backend/sync.mjs` | `flushSession` | send complete snapshot to API internal endpoint | missing snapshot/doc on flush |
| `backend/sync.mjs` | `loadPersistedState` | recover snapshot and update count on room create | reconnect loses latest snapshot |

### 7.5 Frontend Integration
| File | Function/Area | Requirement | Fail Condition |
|---|---|---|---|
| `src/views/WorkspacePage.tsx` | editor update/save/realtime handlers | keep canonical editor doc aligned with API + sync events | lossy round-trip or stale editor state |
| `src/api/client.ts` | route client methods | keep path/query/body contracts aligned with backend | runtime contract drift |
| `src/api/types.ts` | payload/event types | encode all required route + sync fields | `any` or implicit field loss |

## 8. UI Element and State Matrix (Lane F)
| Screen | Element | Required States | Data Source | Trigger |
|---|---|---|---|---|
| Workspace | editor surface | loading, ready, error | `workspace/docDraft` | route load + updates |
| Workspace | save indicator | idle, saving, saved, error | `saveState` | manual save + realtime |
| Workspace | proposal mode controls | enabled/disabled | `workspace.document.proposalId` | create/submit/merge |
| Workspace | history tab | loading, ready, error, empty | history API | tab switch |
| Workspace | approval panel | pending/approved per role + busy role | approvals payload | approve action |
| Workspace | merge action | ready/blocked/busy | merge gate counts | merge request |
| Workspace | thread list | loading/ready/empty | thread payload | workspace load |

## 9. Test Case Matrix
| ID | Level | Scenario | Expected |
|---|---|---|---|
| `P2-GIT-001` | integration | create proposal branch and commit | branch exists with new head |
| `P2-GIT-002` | integration | merge with open blockers | `MERGE_GATE_BLOCKED` |
| `P2-GIT-003` | integration | save named version | tag + named version record created |
| `P2-API-001` | integration | history `proposalId=main` | branch `main`, `proposalId=null` |
| `P2-API-002` | integration | compare without `from`/`to` | `422 VALIDATION_ERROR` |
| `P2-API-003` | integration | legal approval before blockers | `409 APPROVAL_ORDER_BLOCKED` |
| `P2-SYNC-001` | integration | realtime update broadcast | peer receives `document_update` |
| `P2-SYNC-002` | integration | reconnect after disconnect | receives latest `snapshot` |
| `P2-SYNC-003` | integration | duplicate session-ended flush | idempotent response, no duplicate commit |
| `P2-UI-001` | e2e | editor save then reload | content preserved |
| `P2-UI-002` | e2e | approve role flow | UI state updates to approved |
| `P2-UI-003` | e2e | merge blocked UI | user sees blocked merge state |

## 10. PR Evidence Requirements (Mandatory)
- Spec link in PR body: `docs/specs/PHASE-2_Core_Document_Engine_Detailed_Spec.md`
- Change map for every implemented `P2-*` requirement:
  - file
  - function
  - contract item
  - test ID coverage
- Evidence bundle:
  - API request/response samples (success + failure)
  - websocket frame samples for `connected/snapshot/document_update`
  - UI screenshots or short recordings for state transitions
  - CI run proving blocking checks passed
- Explicit out-of-scope list.

## 11. Definition of Done
- [ ] All mandatory phase route, realtime, and function-level contracts implemented.
- [ ] No mock-only path is counted as done for live-backed flows.
- [ ] Merge gate and approval dependency enforcement validated by tests.
- [ ] Realtime and history workflows pass automated tests and manual smoke.

