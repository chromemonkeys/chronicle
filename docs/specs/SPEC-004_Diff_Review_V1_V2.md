# SPEC-004 Diff Review Vision (V1/V2)

Last updated: 2026-02-27  
Owner: Product + Lane D (Git/compare) + Lane F (UI) + Lane G (deliberation/approvals)

## 1. Product Narrative

Chronicle diff is not a cosmetic compare view. Its job is to let a reviewer answer four questions in one pass:

1. What changed?
2. Why did it change?
3. Who agrees or objects?
4. Is this ready to merge?

Word is strong at visual markup. Chronicle wins when each change is also a review object with discussion, approval state, and decision outcome attached.

## 2. Problem Statement

Current compare behavior can show that edits happened, but does not always provide a trustworthy, context-rich review story at change level. Reviewers can miss intent, lose local context, and rely on counts instead of evidence.

## 3. Success Criteria

### V1 success (must-have)

- Reviewer can inspect every change inline with surrounding unchanged context.
- Reviewer can navigate changes deterministically from a right-rail list.
- Reviewer can perform per-change decisions (`accept`, `reject`, `defer`) with audit trail.
- Merge gate reasons are explicit and linked to unresolved changes/threads.

### V2 success (differentiation)

- Every change can display linked deliberation and approval evidence in-place.
- Decision log can be generated directly from change-level outcomes.
- Reviewer effort drops measurably versus V1 baseline.

## 4. Non-Goals

- Reproducing Microsoft Word UI 1:1.
- Building a separate review product outside existing workspace flow.
- Expanding scope to full formatting inspector in V1.

## 5. UX Contract (Exact Behavior)

### 5.1 Modes

- `Unified`: one reading column with inline insert/delete/modify marks.
- `Split`: side-by-side before/after with synchronized anchors.
- Mode switch is global and persistent per user preference.

### 5.2 Change Visibility Rules

- Never render changed content without nearby unchanged context.
- Deleted-only regions must still display neighbor context before/after deletion.
- Long unchanged spans can be collapsed, but must be expandable inline.

### 5.3 Right-Rail Change Navigator

Each change row must include:

- Stable change id (`chg_*`).
- Type: `inserted`, `deleted`, `modified`, `moved`, `format_only`.
- Snippet (first meaningful text span).
- Author and timestamp of source edit.
- Review state: `pending`, `accepted`, `rejected`, `deferred`.
- Link badges: thread count, approval blockers (if any).

Interaction contract:

- Click row -> scroll to change anchor and focus marker.
- Next/previous change keyboard shortcuts.
- Filters by type, author, state, and unresolved only.

### 5.4 Per-Change Actions

For each change marker (inline and rail):

- `Accept`
- `Reject`
- `Defer`
- `Open thread` / `View thread`

Action rules:

- Action emits audit event with actor, timestamp, branch, and compare range.
- Reject requires optional rationale field (configurable required by workspace policy).
- Defer keeps merge blocked when policy requires all changes resolved.

### 5.5 Merge Gate Panel

Gate panel must list exact blockers as links:

- Required approvals missing.
- Open required threads.
- Changes still `pending` or `deferred` (policy-dependent).

No generic “blocked” state without itemized blockers.

## 6. Data and API Contract

### 6.1 Canonical Change Object

`DocumentComparePayload` must include deterministic change objects:

```json
{
  "id": "chg_01J...",
  "type": "modified",
  "fromRef": "686cef9",
  "toRef": "a137513",
  "anchor": {
    "nodeId": "node_abc",
    "fromOffset": 120,
    "toOffset": 164
  },
  "context": {
    "before": "string",
    "after": "string"
  },
  "snippet": "changed phrase",
  "author": {
    "id": "usr_123",
    "name": "Avery"
  },
  "editedAt": "2026-02-27T18:20:00Z",
  "reviewState": "pending",
  "threadIds": ["thr_1"],
  "blockers": ["thread_open"]
}
```

### 6.2 Determinism Rules

- Same `fromRef`/`toRef` pair must return stable change ids and order.
- Zero-diff responses must return empty change list, never synthetic placeholder changes.
- Move detection must not degrade minor edits into delete+insert blobs when confidence is high.

### 6.3 Policy Hooks

Workspace policy fields:

- `requireRationaleOnReject`
- `allowMergeWithDeferredChanges`
- `ignoreFormatOnlyChangesForGate`

## 7. Engineering Scope

### 7.1 V1 Scope (delivery target)

Backend (Lane D + Lane G):

- Upgrade compare pipeline to generate stable change-level objects with anchors/context.
- Add review-state mutation endpoints for per-change actions.
- Add merge-gate aggregation endpoint returning blocker list linked to change/thread ids.
- Emit audit events for all review actions.

Frontend (Lane F):

- Replace coarse compare cards with inline markers and deterministic right-rail navigator.
- Implement unified/split rendering over shared change model.
- Add per-change action controls and keyboard navigation.
- Wire merge-gate panel to explicit blocker payload.

Testing (Lane I support):

- Contract tests for compare determinism.
- UI integration tests for rail navigation and per-change actions.
- E2E merge-gate scenarios: clear blockers, hidden blockers, policy variations.

### 7.2 V2 Scope (differentiation target)

Backend:

- Decision-log generation from change outcomes + thread resolutions.
- Confidence scoring for change mapping and surfacing low-confidence cases.
- Analytics events for review throughput and friction.

Frontend:

- Inline “Why” panel per change (linked thread summary + approval state).
- One-click “resolve and apply” flows for common review patterns.
- Advanced filters (only blockers, only my unresolved, only low-confidence mappings).

## 8. Rollout Plan

### V1 milestone sequence

1. Ship deterministic compare model + read-only rail.
2. Ship per-change actions + audit events.
3. Ship merge-gate blocker linking and policy controls.
4. Stabilize via metrics and usability fixes.

### V2 milestone sequence

1. Ship decision-log synthesis from change outcomes.
2. Ship confidence model and reviewer cues.
3. Ship review-efficiency optimizations.

## 9. Metrics

Primary:

- Median time to complete review per 1,000 changed words.
- Re-open rate after merge (proxy for review misses).
- Percent of merges blocked by unresolved explicit blockers versus implicit confusion.

Secondary:

- Navigator usage rate (changes opened from rail).
- Per-change action completion rate.
- Deferred-change carryover rate at merge.

## 10. Acceptance Checklist

- [ ] V1 UX contract implemented exactly for unified/split/rail/actions/gate.
- [ ] Compare payload determinism verified by automated tests.
- [ ] Audit records exist for every per-change review action.
- [ ] Merge gate never reports non-specific blocker states.
- [ ] Metrics instrumentation present for primary and secondary KPIs.
