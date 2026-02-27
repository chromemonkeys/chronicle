# UX Issue Pack: Right Panel + Medium/High Fixes

This pack contains GitHub-ready issues from the UX review. Use with:

```bash
gh issue create --repo chromemonkeys/chronicle --title "<TITLE>" --body-file /tmp/<issue>.md --label ux --label frontend
```

## 1) UX-001 Right Rail Refactor (Issue #1 to implement first)

### Title
`UX-001: Right rail navigation for workspace side panel (discussion/history/log)`

### Body
```md
## Problem
The workspace right panel is horizontally tabbed and overly dense. We need a side navigation rail to free vertical space and improve scanability.

## Scope
- Replace top horizontal tab strip with a vertical tab rail in the workspace right panel.
- Keep semantic tab behavior (`role=tablist`, keyboard navigation) with vertical arrow support.
- Maintain mobile usability: rail collapses to horizontal tabs on narrow viewports.

## Acceptance Criteria
- [ ] Right panel uses vertical rail on desktop for Discussion / History / Log.
- [ ] Keyboard support works with Up/Down/Home/End in rail mode.
- [ ] Mobile breakpoint falls back to horizontal tabs without clipping or overlap.
- [ ] Existing workspace flows remain functionally intact.
- [ ] Playwright coverage includes rail + diff toggle + keyboard tab navigation.

## Files
- `src/views/WorkspacePage.tsx`
- `src/ui/Tabs.tsx`
- `src/styles.css`
- `tests/playwright/chronicle-ui.unit.spec.ts`
```

## 2) UX-002 Consolidate Editing/Review Modes

### Title
`UX-002: Remove duplicate mode controls and keep one global Edit/Review switch`

### Body
```md
## Problem
Workspace currently exposes overlapping mode controls (top-level and toolbar), causing conflicting mental models.

## Scope
- Keep one canonical mode switch in the workspace header.
- Remove duplicate mode toggles from editor toolbar.
- Keep status indicators as non-interactive badges.

## Acceptance Criteria
- [ ] Only one mode control remains.
- [ ] Toolbar no longer includes duplicate mode toggles.
- [ ] Mode state is unambiguous in UI and tests.
```

## 3) UX-003 Header + Toolbar Hierarchy Cleanup

### Title
`UX-003: Simplify workspace header actions and rebalance toolbar hierarchy`

### Body
```md
## Problem
Too many peer actions in the top bar and toolbar; primary CTA competes with secondary controls.

## Scope
- Re-group top actions into primary vs secondary clusters.
- De-emphasize non-critical actions.
- Ensure clear visual hierarchy and spacing.

## Acceptance Criteria
- [ ] Primary CTA has clear dominance.
- [ ] Secondary actions are grouped and visually quieter.
- [ ] No action crowding at desktop widths.
```

## 4) UX-004 Right Panel Density + Progressive Disclosure

### Title
`UX-004: Reduce right panel density and add progressive disclosure for thread details`

### Body
```md
## Problem
Thread/reply/reaction/approval controls are stacked in one dense column, reducing readability and discoverability.

## Scope
- Collapse secondary thread details by default.
- Expand details on active thread selection.
- Keep only primary actions persistently visible.

## Acceptance Criteria
- [ ] Default right panel view is less dense.
- [ ] Secondary controls are discoverable via expand interactions.
- [ ] Vertical scroll burden is reduced in common states.
```

## 5) UX-005 Contrast and Readability Pass

### Title
`UX-005: Improve metadata contrast and side-panel readability (AA-focused pass)`

### Body
```md
## Problem
Muted metadata and helper text are too faint in multiple views.

## Scope
- Increase contrast for panel metadata, disabled labels, and helper copy.
- Keep semantic color mapping for status pills.

## Acceptance Criteria
- [ ] Metadata text contrast improved across workspace and shell pages.
- [ ] No actionable text uses low-contrast tertiary palette.
```

## 6) UX-006 Label/Icon Normalization

### Title
`UX-006: Replace symbolic-only action labels with text-first labels`

### Body
```md
## Problem
Symbol-heavy labels (for example compare/resolve variants) reduce clarity.

## Scope
- Convert action labels to text-first style.
- Keep icons optional and secondary.

## Acceptance Criteria
- [ ] Critical actions are understandable without icon literacy.
- [ ] Naming is consistent across header, toolbar, and side panel.
```

## 7) UX-007 Sidebar Information Architecture Cleanup

### Title
`UX-007: Clarify left sidebar IA and move Create Space action into header context`

### Body
```md
## Problem
Navigation and filtering semantics are mixed, and Create Space is visually detached at the bottom.

## Scope
- Keep sidebar as pure navigation.
- Move Create Space into a contextual header action.

## Acceptance Criteria
- [ ] Sidebar sections read as navigation only.
- [ ] Create Space appears in a high-discoverability location.
```

## 8) UX-008 Empty/Error Recovery UX

### Title
`UX-008: Standardize empty/error state recovery actions across pages`

### Body
```md
## Problem
Some error states provide weak or missing recovery paths.

## Scope
- Add consistent primary and secondary recovery CTAs.
- Include explicit next-step language.

## Acceptance Criteria
- [ ] Every error state has Retry + navigation fallback.
- [ ] Empty states include an action and expected outcome.
```
