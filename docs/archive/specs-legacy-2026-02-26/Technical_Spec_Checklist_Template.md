# Technical Spec Checklist Template

This document is mandatory before implementation starts.

## 1. Feature Metadata
- Feature name:
- Owner:
- Reviewer(s):
- Related issue/ticket:
- Target milestone:

## 2. Problem Statement
- What fails today:
- Why existing implementation is insufficient:
- Explicit examples of lost behavior or broken invariants:

## 3. Functional Requirements (Low-Level)
- [ ] Every required API route is listed with method + path
- [ ] Every required backend function is listed by name
- [ ] Every required UI element is listed
- [ ] Every required user interaction is listed
- [ ] Every required state transition is listed

## 4. Backend Detailed Checklist

### 4.1 API Route Contract Matrix
| Route | Auth | Request Body | Success Response | Failure Responses | Notes |
|---|---|---|---|---|---|
| `POST /api/...` | `Bearer` | `{ ... }` | `200 { ... }` | `401/403/422/500` + stable `code` | |

### 4.2 Function-Level Spec
| File | Function | Inputs | Outputs | Side Effects | Error Conditions |
|---|---|---|---|---|---|
| `backend/server.mjs` | `updateDocument(...)` | `...` | `...` | `writes commit` | `VALIDATION_ERROR` |

### 4.3 Persistence Rules
- Source-of-truth fields:
- Derived/compatibility fields:
- Write path:
- Read path:
- Idempotency behavior:
- Concurrency/locking behavior:

### 4.4 Sync + Realtime Rules (if applicable)
- WebSocket message types:
- Required payload fields:
- Snapshot flush behavior:
- Recovery behavior:
- Deduplication/session guarantees:

## 5. Frontend Detailed Checklist

### 5.1 UI Element Matrix
| Screen | Element | Required | States | Trigger | Data Source |
|---|---|---|---|---|---|
| Workspace | Save button | Yes | idle/saving/saved/error/disabled | click | `docDraft` |

### 5.2 State Ownership
- Source-of-truth client state:
- Derived display state:
- Debounce/throttle behavior:
- Unsaved changes detection:

### 5.3 Error and Empty States
- Network failure:
- Auth failure:
- Validation failure:
- Empty data behavior:

## 6. Security + Permissions Checklist
- [ ] Route-level auth enforced
- [ ] Role/permission checks enforced
- [ ] Internal/external visibility enforced
- [ ] Sensitive data excluded from logs

## 7. Observability Checklist
- [ ] Structured logs added for critical paths
- [ ] Metrics/counters for key actions
- [ ] Audit trail events for governance actions

## 8. Test Plan Checklist
- [ ] Unit tests for business logic
- [ ] Integration tests for API contracts
- [ ] Realtime/sync tests (if applicable)
- [ ] E2E for critical happy path
- [ ] E2E for critical negative path
- [ ] Regression tests for previously broken behavior

## 9. PR Evidence Checklist
- [ ] Spec link included in PR
- [ ] Every checklist item mapped to commit(s) or code references
- [ ] Test evidence attached (names + results)
- [ ] UI evidence attached (screenshots/video)
- [ ] Out-of-scope items explicitly listed

## 10. Definition of Done (Hard Gate)
- [ ] All required functions implemented (no stubs/TODO placeholders)
- [ ] All required UI elements implemented and wired
- [ ] Required tests pass locally and in CI
- [ ] Behavior verified against acceptance criteria
- [ ] Reviewer confirms “no scaffold-only completion”

## 11. Fix Item Breakdown
Create one subsection per fix in this format:

```
Fix N: <Area> — <Outcome>
Problem:
Files:
Changes:
- <path>: <exact change>
Acceptance Criteria:
Tests:
Evidence:
```

