# UI Detailed Implementation Spec

Last updated: 2026-02-26
Owner: Lane F

## 1. Purpose
Define concrete UI implementation requirements for Chronicle web so frontend delivery is testable and not inferred from backend specs.

## 2. In Scope
- App shell and authenticated navigation UX.
- Sign-in, Documents, Workspace, Approvals, and Not Found views.
- Workspace interaction model (editor, discussions, history, decisions, approval chain).
- Responsive behavior and accessibility baseline.
- Error/loading/empty/success states for all major surfaces.

## 3. Out of Scope
- New backend APIs not already listed in active specs.
- Visual redesign/theme overhaul.
- Mobile native apps.

## 4. Screen Contracts

### 4.1 Sign-in (`/sign-in`)
Required:
- [ ] Controlled display-name input with validation feedback.
- [ ] Enter key submits sign-in.
- [ ] Disabled submit while auth request is in flight.
- [ ] Inline error message for auth failures (no silent failure).
- [ ] Remove or wire secondary action ("Use magic link") to real flow.

Acceptance:
- [ ] Successful sign-in redirects to `/documents`.
- [ ] Failed sign-in preserves input and shows actionable error.

### 4.2 Documents (`/documents`)
Required:
- [ ] Four deterministic states: `loading`, `empty`, `error`, `success`.
- [ ] Create document flow without blocking prompt-only UX.
- [ ] Document cards include title, status, updated-by, open-thread count, open action.
- [ ] Retry action on error.

Acceptance:
- [ ] New document creation lands user in its workspace.
- [ ] Empty and error states are visually and semantically distinct.

### 4.3 Workspace (`/workspace/:docId`)
Required:
- [ ] Four deterministic route states: `loading`, `empty`, `error`, `success`.
- [ ] Editor mode toggle (`proposal` vs `review`) with clear visual mode indicator.
- [ ] Tabbed side panel: `Discussion`, `History`, `Log`.
- [ ] Save state indicator: `idle`, `saving`, `saved`, `error`.
- [ ] Realtime status indicator: `connecting`, `connected`, `offline` + participant count.
- [ ] Approval chain panel with per-role pending/approved/busy state.
- [ ] Merge action with blocked state explanation (`pendingApprovals`, `openThreads`).
- [ ] Thread actions: create/reply/vote/react/resolve/reopen/visibility update.
- [ ] History compare UX with `split` and `unified` diff modes.
- [ ] Decision log filters: outcome, query, author.

Acceptance:
- [ ] Workspace never shows stale mode/state after proposal actions.
- [ ] Error states are inline and recoverable (no `window.alert`-only errors).
- [ ] View remains usable when any one panel endpoint fails.

### 4.4 Approvals (`/approvals`)
Required:
- [ ] Four deterministic states: `loading`, `empty`, `error`, `success`.
- [ ] Merge gate preview with all required roles.
- [ ] Approval queue rows with status pills and requester metadata.
- [ ] Retry action on error.

Acceptance:
- [ ] Status rendering exactly matches API payload values.

### 4.5 App Shell and Not Found
Required:
- [ ] Auth loading state before route decision.
- [ ] Unauthenticated redirect to sign-in.
- [ ] Top nav active-link styling for `/documents` and `/approvals`.
- [ ] Not Found page with clear return path.

Acceptance:
- [ ] Header behavior is consistent when entering/leaving workspace routes.

## 5. Component Contracts

### 5.1 Core Components
- [ ] `Button`: disabled/loading variants with keyboard focus visibility.
- [ ] `Tabs`: keyboard navigation and selected-state semantics.
- [ ] `Card`: layout-safe for loading/empty/error patterns.
- [ ] `StatusPill`/`MergeGateBadge`: deterministic mapping from domain states.

### 5.2 Workspace Components
- [ ] `ChronicleEditor`: read-only vs editable behavior tied to workspace mode/role.
- [ ] `EditorToolbar`: action availability reflects current role and selection.
- [ ] `ThreadList`/`ThreadCard`: stable rendering for open/resolved/orphaned threads.
- [ ] `ThreadComposer`: anchor awareness and validation feedback.
- [ ] `DecisionLogTable`: deterministic row rendering and empty-state handling.
- [ ] `ApprovalChain`: supports pending, approved, blocked, busy visuals.

## 6. Responsive and Accessibility Baseline

### 6.1 Responsive
- [ ] Workspace layout remains functional at 1280px, 1024px, 768px, 390px widths.
- [ ] No horizontal overflow in major route shells.
- [ ] Side panels become stackable/collapsible on narrow viewports.

### 6.2 Accessibility
- [ ] All interactive controls are keyboard reachable.
- [ ] Visible focus states on nav, tabs, buttons, thread actions.
- [ ] Inputs have labels and error text associations.
- [ ] Color-only status indicators include text labels.

## 7. Required UI Test Matrix

### 7.1 Component/Unit
- [ ] Tabs keyboard interaction.
- [ ] Button disabled/loading behavior.
- [ ] Status badge mapping.

### 7.2 Integration
- [ ] Route-state transitions for each screen (`loading/empty/error/success`).
- [ ] Workspace action state transitions (save, approve, merge, thread actions).
- [ ] Decision/history filter state and query propagation.

### 7.3 E2E
- [ ] Sign-in -> documents -> workspace happy path.
- [ ] Create document and persist edits.
- [ ] Merge-blocked scenario displays blockers.
- [ ] Realtime connect/disconnect state transitions.
- [ ] Mobile-width smoke for documents and workspace.

## 8. Definition of Done
- [ ] All required screen/component contracts implemented.
- [ ] Required responsive/accessibility baseline met.
- [ ] Required UI tests pass in CI.
- [ ] No mock-only UI flow counted complete when live API exists.
