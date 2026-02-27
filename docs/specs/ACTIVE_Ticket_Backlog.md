# ACTIVE Ticket Backlog

Last updated: 2026-02-26

This is the single source of truth for implementation tickets.
All tickets should be created here first, then mirrored to your issue tracker if needed.

## Status Values
- `todo`
- `in_progress`
- `blocked`
- `done`

## Priority Values
- `P0` blocker
- `P1` high
- `P2` normal

## Ticket Table

| Ticket ID | Area | Priority | Status | Estimate | Spec Link | Summary |
|---|---|---|---|---|---|---|
| `P1-OPS-001` | Platform | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Compose stack health baseline and endpoint checks |
| `P1-DB-001` | Data | P0 | todo | 1.5d | `ACTIVE_Incomplete_Specs.md` §3 | Migration up/down reliability in local + CI |
| `P1-DB-002` | Data | P0 | todo | 0.5d | `ACTIVE_Incomplete_Specs.md` §3 | Decision log immutability enforcement |
| `P1-AUTH-001` | Auth | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Login session contract correctness |
| `P1-AUTH-002` | Auth | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Refresh token revocation behavior |
| `P1-AUTH-003` | Auth | P0 | todo | 0.5d | `ACTIVE_Incomplete_Specs.md` §3 | Protected route auth gate checks |
| `P1-RBAC-001` | Auth/RBAC | P0 | todo | 0.5d | `ACTIVE_Incomplete_Specs.md` §3 | Viewer write denial enforcement |
| `P1-RBAC-002` | Auth/RBAC | P1 | todo | 0.5d | `ACTIVE_Incomplete_Specs.md` §3 | Approver action allow matrix |
| `P1-CI-001` | CI | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Blocking CI checks (build/test/lint/typecheck/migrations) |
| `P2-GIT-001` | Git/Proposals | P0 | todo | 1.5d | `ACTIVE_Incomplete_Specs.md` §3 | Proposal branch + commit flow |
| `P2-GIT-002` | Git/Gate | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Merge gate blocked behavior |
| `P2-GIT-003` | Git/Versions | P1 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Named version tagging |
| `P2-API-001` | API | P0 | todo | 0.5d | `ACTIVE_Incomplete_Specs.md` §5 | Main-branch history query behavior |
| `P2-API-002` | API | P1 | todo | 0.5d | `ACTIVE_Incomplete_Specs.md` §5 | Compare validation and error contracts |
| `P2-API-003` | API/Approvals | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §5 | Approval dependency guard |
| `P2-SYNC-001` | Realtime | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Realtime broadcast contract |
| `P2-SYNC-002` | Realtime | P0 | todo | 1d | `ACTIVE_Incomplete_Specs.md` §3 | Reconnect snapshot recovery |
| `P2-SYNC-003` | Realtime/API | P0 | todo | 1.5d | `ACTIVE_Incomplete_Specs.md` §5 | Sync flush idempotency |
| `P2-UI-001` | UI | P0 | todo | 1d | `UI_Detailed_Implementation_Spec.md` | Editor save/reload preservation UX |
| `P2-UI-002` | UI | P1 | todo | 0.75d | `UI_Detailed_Implementation_Spec.md` | Approval flow UI state wiring |
| `P2-UI-003` | UI | P1 | todo | 0.75d | `UI_Detailed_Implementation_Spec.md` | Merge blocked UX behavior |
| `UI-001` | UI/Sign-in | P1 | todo | 0.5d | `UI_Detailed_Implementation_Spec.md` §4.1 | Sign-in validation, submit UX, magic-link action handling |
| `UI-002` | UI/Documents | P1 | todo | 1d | `UI_Detailed_Implementation_Spec.md` §4.2 | Replace prompt-based create flow with inline modal/form |
| `UI-003` | UI/Workspace | P0 | todo | 2d | `UI_Detailed_Implementation_Spec.md` §4.3 | Harden workspace error/loading/success state isolation |
| `UI-004` | UI/Workspace | P1 | todo | 1d | `UI_Detailed_Implementation_Spec.md` §4.3 | Inline action errors for thread/approval/merge actions |
| `UI-005` | UI/Responsive | P1 | todo | 1d | `UI_Detailed_Implementation_Spec.md` §6.1 | Responsive layouts for 1280/1024/768/390 widths |
| `UI-006` | UI/A11y | P1 | todo | 1d | `UI_Detailed_Implementation_Spec.md` §6.2 | Keyboard/focus/label/status-text accessibility pass |
| `UI-007` | UI/Test | P0 | todo | 1.5d | `UI_Detailed_Implementation_Spec.md` §7 | Add missing UI unit/integration/e2e coverage |
| `RM-001` | Roadmap/Collab | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Spaces and hierarchical document tree |
| `RM-002` | Roadmap/Search | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Full-text search with Meilisearch + fallback |
| `RM-003` | Roadmap/Migration | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Confluence import (v1 scope) |
| `RM-004` | Roadmap/Export | P0 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §9 | Export to PDF/Markdown/DOCX |
| `RM-005` | Roadmap/Editor | P1 | todo | 1d | `Chronicle_Product_Vision_v2.txt` §4.1, §9 | oEmbed/iframe/rich links |
| `RM-006` | Roadmap/Platform | P1 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §9 | REST API v1 + webhook contracts |
| `RM-007` | Roadmap/Auth | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | SSO (SAML/OIDC) |
| `RM-008` | Roadmap/Auth | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | SCIM provisioning/deprovisioning |
| `RM-009` | Roadmap/Versioning | P1 | todo | 1d | `Chronicle_Product_Vision_v2.txt` §9 | Blame view |
| `RM-010` | Roadmap/Editor | P1 | todo | 1d | `Chronicle_Product_Vision_v2.txt` §9 | Templates library |
| `RM-011` | Roadmap/Collab | P1 | todo | 1d | `Chronicle_Product_Vision_v2.txt` §9 | Backlinks |
| `RM-012` | Roadmap/Notifications | P1 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §9 | Slack/Teams notifications |
| `RM-013` | Roadmap/Governance | P1 | todo | 1d | `Chronicle_Product_Vision_v2.txt` §9 | Approval delegation |
| `RM-014` | Roadmap/Governance | P1 | todo | 1d | `Chronicle_Product_Vision_v2.txt` §9 | Approval reminders/escalations |
| `RM-015` | Roadmap/Platform | P1 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §9 | Helm chart deployment |
| `RM-016` | Roadmap/Cloud | P1 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Chronicle Cloud managed hosting baseline |
| `RM-017` | Roadmap/AI | P1 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | AI drafting assistant (tracked changes) |
| `RM-018` | Roadmap/Integrations | P1 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §9 | DocuSign/HelloSign integration |
| `RM-019` | Roadmap/Compliance | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Advanced audit/compliance reporting |
| `RM-020` | Roadmap/Permissions | P0 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §8.4 | Enterprise sharing controls pack |
| `RM-021` | Roadmap/Compliance | P0 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §8.4, §9 | Data residency controls |
| `RM-022` | Roadmap/Client-Portal | P1 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §8.5 | Client portal external collaboration |
| `RM-023` | Roadmap/Editor | P2 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Whiteboards v1 |
| `RM-024` | Roadmap/Integrations | P1 | todo | 1.5d | `Chronicle_Product_Vision_v2.txt` §9 | Jira/Linear deep integration |
| `RM-025` | Roadmap/Platform | P2 | todo | 2d | `Chronicle_Product_Vision_v2.txt` §9 | Plugin/extension marketplace |
| `RM-026` | Roadmap/Mobile | P2 | todo | 3d | `Chronicle_Product_Vision_v2.txt` §9 | Mobile apps (iOS/Android) |

## Sprint Order
1. Sprint A: `P1-OPS-001`, `P1-DB-001`, `P1-AUTH-001`, `P1-AUTH-003`, `P1-RBAC-001`, `P1-CI-001`
2. Sprint B: `P1-DB-002`, `P1-AUTH-002`, `P1-RBAC-002`, `P2-API-003`
3. Sprint C: `P2-GIT-001`, `P2-API-001`, `P2-API-002`, `P2-GIT-002`, `P2-GIT-003`
4. Sprint D: `P2-SYNC-001`, `P2-SYNC-002`, `P2-SYNC-003`
5. Sprint E (UI hardening): `P2-UI-001`, `P2-UI-002`, `P2-UI-003`, `UI-001`, `UI-002`, `UI-003`, `UI-004`, `UI-005`, `UI-006`, `UI-007`

## Ticket Template

```md
Title: <Ticket ID> - <Summary>
Priority: <P0|P1|P2>
Status: <todo|in_progress|blocked|done>
Estimate: <Xd>
Spec Link: <doc + section>

Scope
- <implementation item>
- <implementation item>

Acceptance Criteria
- <observable behavior>
- <observable behavior>

Tests
- <unit/integration/e2e coverage>
```
