# Git History Visualization Epic: Implementation Plan

## Overview
This document outlines the implementation plan for making Git history visualization understandable, addressing the issues of orphaned branches, unclear merge semantics, and visual noise.

## Current Problems

1. **Orphaned Branches**: Merged branches appear as dead-end lines instead of reconnecting to main
2. **No Clear Origin**: Users can't see where a branch was created from
3. **Merge Confusion**: Merge commits don't clearly indicate source → target relationships
4. **Visual Noise**: Too many low-level commits clutter the view
5. **No State Indicators**: Merged/rejected/active branches all look the same
6. **No View Toggle**: All Git details always visible, overwhelming non-technical users

## Implementation Phases

### Phase 1: Enhanced Branch Metadata (Backend + Types)

**Goal**: Provide richer metadata about branch relationships and merge events.

**Changes to `src/api/types.ts`**:
```typescript
export type WorkspaceHistoryItem = {
  hash: string;
  message: string;
  meta: string;
  branch?: string;
  // NEW: Enriched metadata for visualization
  eventType?: 'commit' | 'merge' | 'fork' | 'sync' | 'system';
  mergeSource?: string;        // Branch that was merged
  mergeTarget?: string;        // Target of merge (usually "main")
  parentHashes?: string[];     // Parent commit hashes
  forkedFrom?: string;         // Hash where branch diverged from main
};

export type DocumentProposalSummary = {
  id: string;
  documentId: string;
  title: string;
  status: "open" | "draft" | "merged" | "rejected" | "approved";
  branchName: string;
  createdBy: string;
  createdAt: string;
  mergedAt?: string;
  openThreads: number;
  // NEW: For clear branch relationship visualization
  forkedFromCommit?: string;   // Commit hash on main where branch originated
  mergedIntoCommit?: string;   // Commit hash on main where branch was merged
};
```

**Backend Considerations** (for future Go implementation):
- The history API should identify merge commits and annotate them with source/target
- Proposal metadata should include fork and merge commit references
- Internal/system commits should be marked as `eventType: 'system'`

### Phase 2: Simplified Graph Layout Algorithm

**Goal**: Create a cleaner, more meaningful graph layout.

**Changes to `src/ui/GitProposalTree.tsx`**:

1. **New Layout Strategy**:
   - Default view: Show only significant events (forks, merges, HEADs)
   - Advanced view: Show all commits (current behavior)
   - Topological ordering prioritizes merge flow over strict chronology

2. **New Types**:
```typescript
type GraphViewMode = 'simplified' | 'advanced';

type VisualEvent = {
  type: 'commit' | 'fork' | 'merge' | 'branch-head' | 'branch-tail';
  hash: string;
  branchId: string;
  displayMessage: string;
  isSignificant: boolean;  // Always show in simplified view
};
```

3. **Lane Assignment Improvements**:
   - Lane 0 = Main branch (always)
   - Active branches = dedicated lanes
   - Merged branches = temporary lanes that terminate at merge point
   - Rejected branches = dashed/dimmed lanes

### Phase 3: Visual Enhancements

**Goal**: Make branch relationships visually obvious.

**CSS/Visual Changes**:

1. **Fork Points**:
   - Visual "branching" indicator at fork point
   - Label showing origin commit on main
   - Slight curve on fork edge

2. **Merge Points**:
   - Branch line visually rejoins main at merge commit
   - Merge commit shown as larger node on main (lane 0)
   - Clear "merged into" label

3. **Branch State Styling**:
   ```
   Active/Open:    Solid line, full color
   Merged:         Line rejoins main, checkmark indicator, muted color
   Rejected:       Dashed line, X indicator, gray color
   Approved:       Solid line, awaiting merge, golden color
   ```

4. **Color Coding**:
   - Consistent color per branch throughout timeline
   - Main branch: Always accent color (#c4622d)
   - Merged branches: Muted version of branch color

### Phase 4: Default/Advanced View Toggle

**Goal**: Reduce cognitive load for non-technical users.

**New Component**: `src/ui/HistoryViewToggle.tsx`

**Behavior**:
- **Default View**:
  - Only shows: Branch creation, branch HEAD, merge commits
  - Collapses intermediate commits into "+N commits" indicator
  - Shows simplified commit messages (no hashes)
  - Clear state badges (Active, Merged, Rejected)

- **Advanced View**:
  - All commits visible (current behavior)
  - Full commit hashes
  - Technical event types visible
  - Full branch graph with all nodes

### Phase 5: Graph-List Alignment

**Goal**: Ensure graph visualization matches timeline list.

**Implementation**:
- Each graph row must correspond 1:1 with a list item
- Hovering graph node highlights list row (and vice versa)
- Clicking either selects the commit
- Synchronized scrolling

## UI Mockup (Text)

### Default View (Simplified)

```
┌─────────────────────────────────────────────────────────────┐
│  [Simplified ▼]  [Default view prioritizes clarity]        │
├─────────────────────────────────────────────────────────────┤
│  ●──┬── main                                                │
│     │   ADR-142: Add retention policy                       │
│     │   Avery · 2 hours ago                                 │
│     │                                                        │
│     ├──●── proposal/adr-142 [Merged ✓]                     │
│     │  │   Merged into main                                 │
│     │  │   Avery · 3 hours ago                              │
│     │  │   +2 commits                                       │
│     │  └──┘  ←── visual rejoin indicator                    │
│     │                                                        │
│  ●──┴── main                                                │
│         Initial ADR-142 draft                               │
│         Avery · Yesterday                                   │
└─────────────────────────────────────────────────────────────┘
```

### Advanced View (Full Git Graph)

```
┌─────────────────────────────────────────────────────────────┐
│  [Advanced ▼]  [Full Git-level detail]                     │
├─────────────────────────────────────────────────────────────┤
│  ● main  (3)                                                │
│  │  a1b2c3d  ADR-142: Add retention policy                  │
│  │  Avery · 2 hours ago                                     │
│  │                                                          │
│  │    ● proposal/adr-142  [Merged]                         │
│  │    │  d4e5f6a  Merge proposal/adr-142 into main          │
│  │    │  Avery · 3 hours ago                                │
│  │    │                                                      │
│  │    ●  c7d8e9f  Address review feedback                   │
│  │    │  Avery · 5 hours ago                                │
│  │    │                                                      │
│  │    ●  b0c1d2e  Initial proposal                          │
│  └──┬─┘                                                      │
│     │  (fork from a1b2c3d^)                                 │
│  ● main  (2)                                                │
│     e3f4a5b  Initial ADR-142 draft                          │
│     Avery · Yesterday                                       │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Checklist

### Phase 1: Types and Data
- [ ] Update `WorkspaceHistoryItem` type with event metadata
- [ ] Update `DocumentProposalSummary` with fork/merge refs
- [ ] Document required backend API changes

### Phase 2: Graph Algorithm
- [ ] Implement `simplified` vs `advanced` view modes
- [ ] Refactor `buildGraph` to support topological merge visualization
- [ ] Add significance filtering for simplified view
- [ ] Implement lane reuse for merged/rejected branches

### Phase 3: Visual Design
- [ ] Add fork point visual indicators
- [ ] Add merge rejoin visualization (branch connects to main)
- [ ] Implement branch state styling (active/merged/rejected)
- [ ] Add state badges and labels

### Phase 4: View Toggle
- [ ] Create `HistoryViewToggle` component
- [ ] Add view mode state management
- [ ] Implement commit collapsing ("+N commits")
- [ ] Add mode persistence (localStorage)

### Phase 5: Integration
- [ ] Ensure graph-list synchronization
- [ ] Add hover/click interactions between graph and list
- [ ] Test with complex branch scenarios
- [ ] Update Playwright tests

## Testing Scenarios

1. **Simple Merge**: Single proposal merged into main
2. **Multiple Proposals**: Several active proposals at once
3. **Sequential Merges**: Proposal A merges, then Proposal B merges
4. **Rejected Proposal**: Proposal rejected (should show as dead-end with X)
5. **Complex Fork**: Proposal created from older main commit (not latest)
6. **Empty Document**: No commits yet

## Success Criteria

Per the Epic Definition of Done:

- [ ] No branch visually appears orphaned if it has been logically merged
- [ ] Users can trace any proposal from creation → merge (or closure) without confusion
- [ ] The main branch path is clearly identifiable
- [ ] Duplicate or technical-only events are not cluttering the primary timeline
- [ ] A reviewer can understand the state of ADR-142 in under 10 seconds

## Future Backend Enhancements

When the Go backend is fully implemented:

1. **Merge Detection**: API should identify and mark merge commits
2. **System Event Filtering**: Mark auto-commits, sync events as `eventType: 'system'`
3. **Fork Point Tracking**: Store the exact commit where each branch diverged
4. **Squash Merge Support**: Handle squash merges as merge events even without merge commit
