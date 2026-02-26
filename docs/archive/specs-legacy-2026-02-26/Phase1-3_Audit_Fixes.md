# Phase 1-3 Audit Fixes

This document captures the concrete fixes identified in the phase 1-3 audit.

## Fix 1: Support `proposalId=main` in Go history endpoint
- Problem: Review mode compare calls `GET /api/documents/:id/history?proposalId=main`, but Go API treats any non-empty proposalId as a proposal record lookup.
- Changes:
  - Update `api/internal/app/service.go` (`History`) to special-case `"main"` and route to main branch history.
  - Keep existing proposal ID behavior for actual proposal IDs.
  - Ensure response `proposalId` is `null` when branch is main.
- Tests:
  - Add API integration test: history with `proposalId=main` returns `branch=main` and commit list.
  - Add UI flow test coverage for review mode compare.

## Fix 2: Enforce approval ordering in Go API
- Problem: Go `ApproveProposalRole` allows approving `legal` before required technical approvals.
- Changes:
  - Add explicit approval dependency graph:
    - `security`: none
    - `architectureCommittee`: none
    - `legal`: depends on `security` + `architectureCommittee`
  - In `ApproveProposalRole`, validate dependencies before writing approval status.
  - Return conflict with machine-readable code (for example `APPROVAL_ORDER_BLOCKED`) and blocker roles.
- Tests:
  - Add service/API tests for:
    - legal blocked before technical approvals
    - legal allowed after both technical approvals

## Fix 3: Prevent document-branch mismatch and duplicate sync flush commits
- Problem: `HandleSyncSessionEnded` does not verify proposal belongs to `documentID` and does not implement idempotency.
- Changes:
  - Validate `proposal.DocumentID == documentID` before commit.
  - Add sync session dedupe store keyed by `sessionId` (with TTL) and reject or no-op duplicates.
  - Include `sessionId` handling in Go API request body validation.
- Tests:
  - Add tests for:
    - duplicate `sessionId` returns idempotent response and no new commit
    - mismatched `documentID`/`proposalID` returns not found or validation error

## Fix 4: Apply RBAC check to proposal submit action
- Problem: `submit` action currently does not require write privilege.
- Changes:
  - In `api/internal/app/http.go` (`handleProposalAction`), add `rbac.ActionWrite` permission check before submit.
- Tests:
  - Add endpoint authorization test: viewer/commenter forbidden for submit.

## Fix 5: Return 404 when resolving nonexistent/already-irrelevant thread
- Problem: resolving a missing thread can still return success.
- Changes:
  - In `ResolveThread`, if `changed == false`, return `sql.ErrNoRows` (or domain error mapped to 404).
  - Keep idempotent behavior explicit only if desired by product decision; otherwise return deterministic error.
- Tests:
  - Add test for nonexistent thread ID returning `404`.

## Fix 6: Preserve full ProseMirror document (avoid lossy legacy flattening)
- Problem: editor data is collapsed to legacy 5-field content; richer structure can be lost.
- Changes:
  - Extend backend payload model to accept/store full `doc` JSON in Git (or canonical storage model).
  - Keep legacy `content` as derived compatibility view only.
  - Update save/load paths to round-trip `doc` as source of truth.
- Tests:
  - Add round-trip tests for headings/lists/blockquote/code blocks preserving node order and content.

## Fix 7: Harden git operations for correctness under concurrency
- Problem: merge is copy-commit and repository checkout is forceful without lock coordination.
- Changes:
  - Add per-document mutex/lock around git operations in `gitrepo.Service`.
  - Move toward true merge semantics (or explicitly document copy-merge behavior and conflict policy).
  - Add commit metadata for merge provenance (source branch, target branch, merge actor).
- Tests:
  - Add concurrent commit test on same document/branch ensuring no repository corruption and deterministic head.

## Fix 8: Enforce internal/external thread visibility
- Problem: schema has `visibility` but query path does not filter by external context.
- Changes:
  - Add user external-context propagation in request/session model.
  - Enforce visibility filter in thread queries (`INTERNAL` hidden for external users).
  - Add DB-level policy equivalent to architecture target (RLS or constrained query layer until RLS lands).
- Tests:
  - Add API tests:
    - internal user sees all applicable threads
    - external user only sees `EXTERNAL`

## Fix 9: Align automated tests with Go API target stack
- Problem: current e2e validates legacy Node backend instead of Go API.
- Changes:
  - Add Go API integration test harness and migrate critical flows:
    - login/session
    - proposal submit/review/approvals/merge
    - thread resolve -> decision log generation
    - sync session flush
  - Keep legacy tests only if intentionally supporting fallback backend.
- Tests:
  - CI gate must run Go-targeted tests as blocking checks.

## Fix 10: Standardize machine-readable error contracts
- Problem: some paths still rely on string matching or inconsistent error code mapping.
- Changes:
  - Introduce typed domain errors and stable `code` values from service layer.
  - Remove string-fragile checks in HTTP handlers.
  - Update docs and client mappings.
- Tests:
  - Add contract tests asserting status + `code` for each failure path.

## Execution order (recommended)
1. Fixes 1, 2, 4, 5 (API correctness and governance guardrails)
2. Fix 3 (sync safety and idempotency)
3. Fix 9 (test alignment) in parallel with 1-3
4. Fixes 6, 7, 8 (deeper architecture conformance)
5. Fix 10 (contract hardening sweep)
