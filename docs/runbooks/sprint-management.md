# Chronicle Sprint Management Guide

> **Document Version:** 1.0  
> **Last Updated:** 2026-02-28  
> **Owner:** Development Team

---

## Overview

This document defines the sprint-based project management system for Chronicle development. All GitHub issues are now organized into structured sprints using GitHub milestones.

## Sprint Structure

### Active Sprints

| Sprint | Milestone | Focus | Target Date | Issues |
|--------|-----------|-------|-------------|--------|
| Sprint 2 | [v1.0 Foundation Completion](../../milestone/2) | Auth, Permissions, Core Features | 2026-03-15 | 20 open |
| Sprint 3 | [v1.0 Polish & Confluence Import](../../milestone/3) | Final polish, Import completion | 2026-03-29 | 14 open |

### Future Releases

| Release | Milestone | Focus | Target Date | Issues |
|---------|-----------|-------|-------------|--------|
| v1.1 | [Growth Features](../../milestone/4) | SSO, Templates, Notifications | 2026-05-31 | 14 open |
| v2.0 | [Enterprise](../../milestone/5) | AI, DocuSign, Mobile, Compliance | 2026-08-31 | 9 open |

### Special Categories

| Category | Milestone | Purpose |
|----------|-----------|---------|
| Needs Refinement | [📋 Needs Refinement](../../milestone/6) | Issues requiring clarification before assignment |
| Sprint 1 (Complete) | [Core Workflow Integrity ✅](../../milestone/1) | Historical - Core workflow completed |

---

## Sprint 2: v1.0 Foundation Completion (ACTIVE)

**Goal:** Complete all P0 features required for v1.0 release.

**Target Date:** March 15, 2026  
**Duration:** 2-3 weeks

### Key Workstreams

#### 1. Authentication (M6)
- [#83](../../issues/83) AUTH-101: Email/password authentication with verification ⏳ **IN PROGRESS**
- [#93](../../issues/93) AUTH-101b: Rate limiting for auth endpoints

#### 2. Permissions & RBAC (M7)
- [#118](../../issues/118) M7.2: Document Share Dialog — Invite Only Mode 🚨 **P0**
- [#119](../../issues/119) M7.2: Document Sharing Modes — Private & Space Members
- [#120](../../issues/120) M7.2: Space Permissions API & UI
- [#121](../../issues/121) M7.3: Guest Magic Link Authentication
- [#122](../../issues/122) M7.3: Guest UI Indicators & Access Restrictions
- [#105](../../issues/105) M7.2: Space Permissions UI ⏳ **IN PROGRESS**
- [#106](../../issues/106) M7.2: Document Share Dialog ⏳ **IN PROGRESS**

#### 3. Core Features
- [#31](../../issues/31) RM-003: Confluence Space Import ⏳ **IN PROGRESS**
- [#33](../../issues/33) RM-005: oEmbed, Iframe, and Rich Link Cards

#### 4. Page Layout (UX)
- [#96](../../issues/96) Page Layout View: Epic
- [#97](../../issues/97) Page Layout: Core page sheet container ⏳ **IN PROGRESS**
- [#98](../../issues/98) Page Layout: Layout width toggle control
- [#99](../../issues/99) Page Layout: Page header redesign ⏳ **IN PROGRESS**
- [#100](../../issues/100) Page Layout: Multi-column layout support
- [#101](../../issues/101) Page Layout: Table of Contents component
- [#102](../../issues/102) Page Layout: Page footer section

#### 5. Trackers
- [#76](../../issues/76) RECOVERY-TRACKER: Product Realignment
- [#82](../../issues/82) SPRINT-2-TRACKER: v1.0 Foundation Completion

---

## Sprint 3: v1.0 Polish & Confluence Import

**Goal:** Final v1.0 polish and completion of import functionality.

**Target Date:** March 29, 2026  
**Duration:** 2 weeks

### Workstreams

#### 1. Auth Improvements (P1/P2)
- [#92](../../issues/92) AUTH-101a: Async email queue with Redis
- [#94](../../issues/94) AUTH-101c: Email delivery tracking and webhooks
- [#95](../../issues/95) AUTH-101d: Improve email templates

#### 2. Permission System Completion (M7.3)
- [#107](../../issues/107) M7.3: Guest User Management
- [#108](../../issues/108) M7.3: Public Link Sharing
- [#109](../../issues/109) M7.3: Internal/External Thread Visibility

#### 3. Performance & Monitoring (M7.3/M7.4)
- [#123](../../issues/123) M7.3: Expired Permission Cleanup Job
- [#124](../../issues/124) M7.2: Permission Change Audit Events
- [#125](../../issues/125) M7.3: Permission Audit Log UI
- [#126](../../issues/126) M7.3: Redis Permission Cache Layer

#### 4. UX Improvements
- [#60](../../issues/60) UX-006: Replace symbolic-only action labels
- [#61](../../issues/61) UX-007: Clarify left sidebar IA
- [#68](../../issues/68) [A11y] Increase contrast and hierarchy
- [#69](../../issues/69) [A11y] Improve discoverability of icon-only actions

---

## v1.1 Release: Growth Features

**Target Date:** May 31, 2026

### Enterprise Authentication
- [#35](../../issues/35) RM-007: SSO: SAML + OIDC
- [#36](../../issues/36) RM-008: SCIM Provisioning and Deprovisioning

### Collaboration
- [#38](../../issues/38) RM-010: Document Templates Library
- [#39](../../issues/39) RM-011: Backlinks and Document Graph
- [#40](../../issues/40) RM-012: Slack and Microsoft Teams Notifications

### Governance
- [#41](../../issues/41) RM-013: Approval Delegation Workflow
- [#42](../../issues/42) RM-014: Approval Reminder and Escalation Workflows
- [#113](../../issues/113) M7.4: RLS Policy Implementation
- [#114](../../issues/114) M7.4: Permission Audit Logging
- [#115](../../issues/115) M7.4: Break-glass Admin Recovery

### Platform
- [#43](../../issues/43) RM-015: Helm Chart for Kubernetes Deployment ⏳ **IN PROGRESS**
- [#44](../../issues/44) RM-016: Chronicle Cloud Managed Hosting Baseline
- [#116](../../issues/116) M7.5: Group Management
- [#117](../../issues/117) M7.5: SCIM Group Sync

---

## v2.0 Release: Enterprise

**Target Date:** August 31, 2026

### AI & Automation
- [#45](../../issues/45) RM-017: AI Drafting Assistant with Tracked Changes

### Integrations
- [#46](../../issues/46) RM-018: DocuSign and HelloSign Integration
- [#52](../../issues/52) RM-024: Jira and Linear Deep Integration

### Compliance & Security
- [#47](../../issues/47) RM-019: Advanced Audit Log and Compliance Reporting
- [#48](../../issues/48) RM-020: Enterprise Sharing Controls Pack
- [#49](../../issues/49) RM-021: Data Residency Controls

### Client Experience
- [#50](../../issues/50) RM-022: Client Portal External Collaboration Experience

### Editor
- [#51](../../issues/51) RM-023: Whiteboards v1

### Platform
- [#53](../../issues/53) RM-025: Plugin and Extension Marketplace (Early)
- [#34](../../issues/34) RM-006: REST API v1 + Webhook API Contracts

---

## 📋 Needs Refinement

Issues that require more detail, team discussion, or architectural decisions before assignment:

- [#70](../../issues/70) SPEC-P4: Detailed implementation spec for Phase 4 Enterprise Foundation
- [#71](../../issues/71) SPEC-P5: Detailed implementation spec for Phase 5 Integrations and Compliance
- [#72](../../issues/72) SPEC-P6: Detailed implementation spec for Phase 6 Extensibility and Mobile

---

## Sprint Workflow

### 1. Sprint Planning (Every 2 weeks)

```
Day 1: Sprint Planning Meeting
├── Review completed work from previous sprint
├── Review and re-prioritize backlog
├── Assign issues to team members
└── Set sprint goals and acceptance criteria
```

### 2. Daily Standups

```
Daily (async or sync):
├── What did you complete yesterday?
├── What are you working on today?
└── Any blockers or dependencies?
```

### 3. Sprint Review & Retrospective

```
Last Day of Sprint:
├── Demo completed features
├── Update issue statuses
├── Close completed sprint milestone
├── Document lessons learned
└── Plan next sprint
```

---

## Issue Lifecycle

### Status Labels

| Label | Meaning | Usage |
|-------|---------|-------|
| `status:todo` | Ready to start | Backlog items |
| `status:in-progress` | Actively being worked on | Assignee is coding |
| `status:review` | PR submitted, needs review | Code review phase |
| `status:done` | Complete and merged | Acceptance criteria met |
| `status:blocked` | Cannot proceed | Needs external input |

### Priority Labels

| Label | Priority | Response |
|-------|----------|----------|
| `priority:P0` | Critical | Drop everything, fix immediately |
| `priority:P1` | High | Current sprint focus |
| `priority:P2` | Medium | Next sprint or backlog |

### Area Labels

- `area:Auth` - Authentication system
- `area:Auth/RBAC` - Authorization and permissions
- `area:UI` - User interface components
- `area:UI/A11y` - Accessibility
- `area:UI/Workspace` - Workspace UI
- `area:UI/Test` - Testing infrastructure
- `area:API` - Backend API
- `area:Git/Gate` - Git operations and merge gates
- `area:Data` - Data integrity and storage
- `area:roadmap-*` - Roadmap category

---

## How to Use This System

### Creating a New Issue

1. Create issue with clear title and description
2. Add appropriate labels (`area:*`, `priority:*`)
3. If immediately actionable, assign to current sprint milestone
4. If needs discussion, assign to "📋 Needs Refinement"

### Moving Issues Between Sprints

```bash
# Move issue to different sprint
gh issue edit <number> --milestone "Sprint 3: v1.0 Polish & Confluence Import"
```

### Marking Issues Complete

1. Ensure PR is merged
2. Add `status:done` label
3. Close the issue (milestone will track completion)

### Handling Blockers

1. Add `status:blocked` label
2. Comment with blocker details
3. Tag relevant team members
4. If blocker extends > 2 days, consider moving to next sprint

---

## Viewing Sprint Progress

### GitHub Milestones

View all milestones and progress:
```
https://github.com/chromemonkeys/chronicle/milestones
```

### Filter by Milestone

View issues in specific sprint:
```bash
gh issue list --milestone "Sprint 2: v1.0 Foundation Completion"
```

### View Your Assignments

```bash
gh issue list --assignee @me --state open
```

---

## Sprint Calendar

| Sprint | Start | End | Focus |
|--------|-------|-----|-------|
| Sprint 1 | - | ✅ Complete | Core Workflow Integrity |
| Sprint 2 | 2026-02-28 | 2026-03-15 | v1.0 Foundation Completion |
| Sprint 3 | 2026-03-15 | 2026-03-29 | v1.0 Polish & Import |
| v1.1 Planning | 2026-04-01 | 2026-05-31 | Growth Features |
| v2.0 Planning | 2026-06-01 | 2026-08-31 | Enterprise |

---

## Contact

For questions about sprint organization:
- Comment on [#76](../../issues/76) (Recovery Tracker)
- Comment on [#82](../../issues/82) (Sprint 2 Tracker)

---

**Related Documents:**
- [Product Vision](../agent-memory/Chronicle_Product_Vision_v2.txt)
- [Technical Architecture](../agent-memory/Chronicle_Technical_Architecture.txt)
- [Architecture Model](../architecture-model/README.md)
