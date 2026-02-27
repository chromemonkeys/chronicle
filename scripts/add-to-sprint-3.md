# Add Role & User Management Tickets to Sprint 3

## Quick Setup Instructions

Since GitHub Projects V2 requires some manual setup for the best experience, follow these steps:

### Step 1: Create the GitHub Project

1. Go to: `https://github.com/chromemonkeys/chronicle/projects`
2. Click **"New Project"**
3. Select **"Table"** layout
4. Name: `Chronicle Development`
5. Click **Create**

### Step 2: Configure Project Fields

In your new project, click **Settings** (gear icon) and add these fields:

#### Iteration Field: "Sprint"
- Type: **Iteration**
- Click "Add iteration" and create:
  - **Sprint 1** (past)
  - **Sprint 2** (past)  
  - **Sprint 3** (current) ← Set dates for your current sprint
  - **Sprint 4** (future)

#### Single Select: "Priority"
- P0 (Critical)
- P1 (High)
- P2 (Medium)
- P3 (Low)

#### Single Select: "Size"
- XS
- S
- M
- L
- XL

#### Single Select: "Milestone"
- M7.1 (Core Infrastructure)
- M7.2 (UI - Space & Document)
- M7.3 (External Collaboration)
- M7.4 (Security & Audit)
- M7.5 (Groups & Enterprise)

### Step 3: Create the Issues

Run this command to create all 12 issues:

```bash
./scripts/setup-sprint-3.sh
```

Or create them manually using the spec in `docs/specs/role-user-management-tickets.md`

### Step 4: Add Issues to Project

#### Option A: Bulk Add via Project UI
1. Go to your project
2. Click **"+ Add item"**
3. Search for issues by label `m7.1`, `m7.2`, etc.
4. Select all and add them

#### Option B: Use GitHub CLI (one by one)
```bash
# After creating the project, get the project number:
gh api graphql -f query='
  query {
    repository(owner: "OWNER", name: "REPO") {
      projectsV2(first: 10) {
        nodes { number title }
      }
    }
  }
'

# Then add each issue (replace PROJECT_NUMBER and ISSUE_NUMBER):
gh api graphql -f query='
  mutation {
    addProjectV2ItemById(input: {
      projectId: "PROJECT_ID"
      contentId: "ISSUE_NODE_ID"
    }) {
      item { id }
    }
  }
'
```

### Step 5: Set Sprint and Metadata

In the project table view:
1. Select all M7.1 issues
2. Set **Sprint** = "Sprint 3"
3. Set **Priority** and **Size** according to the ticket specs
4. Repeat for M7.2, M7.3, M7.4, M7.5

### Step 6: Configure Views

Create these views for easy tracking:

#### View: "Sprint 3 - Board"
- Layout: **Board**
- Group by: **Status**
- Filter: Sprint is "Sprint 3"

#### View: "Sprint 3 - By Priority"
- Layout: **Table**
- Sort by: **Priority** (ascending)
- Filter: Sprint is "Sprint 3"

#### View: "By Milestone"
- Layout: **Board**
- Group by: **Milestone**
- Filter: Sprint is "Sprint 3"

---

## Issue Checklist

Copy this into a GitHub task list for tracking:

### M7.1: Core Infrastructure
- [ ] #101 Database Schema for RBAC [P0] [M]
- [ ] #102 Core Permission Service Layer [P0] [L]

### M7.2: UI - Space & Document Permissions
- [ ] #103 Space Permissions UI [P0] [L]
- [ ] #104 Document Share Dialog [P0] [M]

### M7.3: External Collaboration
- [ ] #105 Guest User Management [P1] [L]
- [ ] #106 Public Link Sharing [P1] [M]
- [ ] #107 Internal/External Thread Visibility [P0] [M]

### M7.4: Security & Audit
- [ ] #108 RLS Policy Implementation [P0] [M]
- [ ] #109 Permission Audit Logging [P1] [M]
- [ ] #115 Break-glass Admin Recovery [P2] [S]

### M7.5: Groups & Enterprise
- [ ] #110 Group Management [P2] [L]
- [ ] #111 SCIM Group Sync [P2] [XL]

---

## Sprint 3 Capacity Planning

| Milestone | Issues | Total Points | Focus |
|-----------|--------|--------------|-------|
| M7.1 | 2 | 13 | Backend foundation |
| M7.2 | 2 | 13 | Frontend UI |
| M7.3 | 3 | 18 | External features |
| M7.4 | 3 | 10 | Security hardening |
| M7.5 | 2 | 21 | Enterprise features |
| **Total** | **12** | **75** | |

**Recommended team allocation:**
- 1 Backend engineer → M7.1, M7.4, M7.5
- 1 Full-stack engineer → M7.2, M7.3
- 1 DevOps/Backend engineer → M7.5 (SCIM)
