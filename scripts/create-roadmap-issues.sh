#!/usr/bin/env bash
set -euo pipefail

GH_REPO="${GH_REPO:-chromemonkeys/chronicle}"
DRY_RUN="${DRY_RUN:-0}"

ensure_label() {
  local label_name="$1"
  gh api "repos/$GH_REPO/labels" \
    --method POST \
    -f name="$label_name" \
    -f color="1f6feb" \
    -f description="Auto-created by roadmap issue script" >/dev/null 2>&1 || true
}

issue_exists() {
  local title="$1"
  gh issue list --repo "$GH_REPO" --state all --search "\"$title\" in:title" --json title | rg -q "\"title\":\"$title\""
}

create_issue() {
  local id="$1"
  local title_suffix="$2"
  local area="$3"
  local priority="$4"
  local milestone="$5"
  local problem="$6"
  local files="$7"
  local changes="$8"
  local acceptance="$9"
  local tests="${10}"

  local title="$id - $title_suffix"
  if issue_exists "$title"; then
    echo "SKIP (exists): $title"
    return
  fi

  ensure_label "ticket"
  ensure_label "roadmap"
  ensure_label "priority:$priority"
  ensure_label "area:$area"
  ensure_label "milestone:$milestone"

  local body
  body=$(cat <<EOF
## 1. Feature Metadata
- Ticket ID: \`$id\`
- Area: \`$area\`
- Priority: \`$priority\`
- Milestone: \`$milestone\`
- Source: \`docs/agent-memory/Chronicle_Product_Vision_v2.txt\`, \`docs/agent-memory/Chronicle_Technical_Architecture.txt\`

## 2. Problem Statement
$problem

## 3. Files / Modules
$files

## 4. Required Changes
$changes

## 5. Acceptance Criteria
$acceptance

## 6. Tests
$tests
EOF
)

  if [[ "$DRY_RUN" == "1" ]]; then
    echo "DRY_RUN create: $title"
    return
  fi

  gh issue create \
    --repo "$GH_REPO" \
    --title "$title" \
    --body "$body" \
    --label "ticket" \
    --label "roadmap" \
    --label "priority:$priority" \
    --label "area:$area" \
    --label "milestone:$milestone" >/dev/null
  echo "CREATED: $title"
}

create_issue "RM-001" "Spaces and Hierarchical Document Tree" "roadmap-collab" "P0" "v1.0" \
"Current implementation lacks full space-level navigation, inheritance, and hierarchical tree operations required for large teams." \
$'- `api/internal/app/*` (space CRUD + tree APIs)\n- `api/internal/store/*` (space/document hierarchy tables)\n- `src/ui/DocumentTree.tsx`\n- `src/views/DocumentsPage.tsx`' \
$'- Implement spaces CRUD and nested document tree APIs.\n- Add move/rename/archive operations with permission checks.\n- Add tree virtualization and expand/collapse state persistence.' \
$'- [ ] Users can create nested spaces/documents and reorder reliably.\n- [ ] Permissions inherit correctly from space to document.\n- [ ] Tree operations update UI and backend consistently.' \
$'- Integration: hierarchy create/move/rename/delete.\n- E2E: tree navigation and move operations.\n- Permission tests for inherited access.'

create_issue "RM-002" "Full-Text Search with Meilisearch + Fallback" "roadmap-search" "P0" "v1.0" \
"Search is a core v1.0 promise and must index document body + deliberation metadata with secure filtering." \
$'- `api/internal/search/*`\n- `api/internal/app/http.go`\n- `api/internal/store/*`\n- `src/views/DocumentsPage.tsx`' \
$'- Build indexing pipeline for documents, threads, decision log.\n- Add permission-aware query filters for internal/external visibility.\n- Add PostgreSQL FTS fallback when Meilisearch unavailable.' \
$'- [ ] Search returns relevant, permission-safe results.\n- [ ] Service falls back gracefully when Meilisearch is down.\n- [ ] UI supports query + basic filter facets.' \
$'- Integration: index/update/delete + query contracts.\n- Security tests: external users cannot search internal-only content.\n- E2E: search journey from documents/workspace.'

create_issue "RM-003" "Confluence Space Import (v1 Scope)" "roadmap-migration" "P0" "v1.0" \
"Confluence import is a migration-critical promise; scope must be implemented at least for pages and hierarchy." \
$'- `api/internal/import/*`\n- `api/internal/app/http.go`\n- `api/internal/store/*`\n- `src/views/DocumentsPage.tsx`' \
$'- Implement import job API and progress tracking.\n- Import page hierarchy and document body content to Chronicle schema.\n- Define and enforce explicit v1 scope for unsupported artifacts.' \
$'- [ ] Confluence hierarchy imports into spaces/documents correctly.\n- [ ] Import job progress and failures are visible.\n- [ ] Unsupported artifacts are reported, not silently dropped.' \
$'- Integration: import pipeline fixtures.\n- E2E: run import and verify tree/content output.\n- Regression: idempotent import behavior.'

create_issue "RM-004" "Export to PDF, Markdown, DOCX" "roadmap-export" "P0" "v1.0" \
"Exports are required for operational workflows and compliance handoffs." \
$'- `api/internal/export/*`\n- `api/internal/app/http.go`\n- `src/views/WorkspacePage.tsx`' \
$'- Add export endpoints for PDF/Markdown/DOCX.\n- Enforce permission and visibility constraints during export.\n- Add export actions in workspace UI.' \
$'- [ ] All 3 formats export for eligible roles.\n- [ ] Internal-only threads are excluded from external exports.\n- [ ] Export failures return stable error contracts.' \
$'- Integration: format generation and metadata checks.\n- Security tests: visibility stripping in external exports.\n- E2E: user export flow from workspace.'

create_issue "RM-005" "oEmbed, Iframe, and Rich Link Cards" "roadmap-editor" "P1" "v1.0" \
"Embed support is a product differentiator and must render safely with provider-aware behavior." \
$'- `src/editor/extensions/*`\n- `api/internal/app/*` (embed metadata proxy if needed)\n- `src/editor/ChronicleEditor.tsx`' \
$'- Implement provider detection for common embed URLs.\n- Add safe iframe sandboxing and allowlist controls.\n- Render rich link cards fallback for non-embeddable URLs.' \
$'- [ ] Supported providers render in-editor embeds.\n- [ ] Unsafe embeds are blocked/sandboxed.\n- [ ] Unsupported URLs degrade to rich link cards.' \
$'- Unit: URL parser/provider mapping.\n- Integration: embed rendering states.\n- Security: iframe sandbox and policy checks.'

create_issue "RM-006" "REST API v1 + Webhook API Contracts" "roadmap-platform" "P1" "v1.0" \
"Roadmap requires a stable public API and webhook contract for integrations." \
$'- `api/internal/app/http.go`\n- `api/internal/app/service.go`\n- `api/internal/notifications/*`\n- `docs/specs/*`' \
$'- Define versioned REST routes and stable machine-readable error codes.\n- Implement webhook subscriptions and signed event delivery.\n- Add retry/backoff + delivery audit trails.' \
$'- [ ] API v1 contracts documented and stable.\n- [ ] Webhook deliveries are signed and retryable.\n- [ ] Consumers receive deterministic payloads.' \
$'- Contract tests for REST and webhook schemas.\n- Integration tests for retries/signatures.\n- E2E smoke using stub webhook receiver.'

create_issue "RM-007" "SSO: SAML + OIDC" "roadmap-auth" "P0" "v1.1" \
"Enterprise adoption requires SSO via SAML and OIDC with predictable role/group mapping." \
$'- `api/internal/auth/*`\n- `api/internal/app/http.go`\n- `src/views/SignInPage.tsx`' \
$'- Implement SAML and OIDC login flows.\n- Add org-level configuration for identity providers.\n- Map IdP attributes to Chronicle roles/groups.' \
$'- [ ] Users can authenticate via SAML and OIDC.\n- [ ] Login/session behavior matches existing token lifecycle.\n- [ ] Role/group mapping is deterministic and auditable.' \
$'- Integration: IdP callback/token exchange tests.\n- Security tests: assertion validation and replay protections.\n- E2E: SSO login redirect flow.'

create_issue "RM-008" "SCIM Provisioning and Deprovisioning" "roadmap-auth" "P0" "v1.1" \
"Automated user/group lifecycle is required for enterprise identity governance." \
$'- `api/internal/scim/*`\n- `api/internal/store/*`\n- `api/internal/permissions/*`' \
$'- Implement SCIM user/group CRUD endpoints.\n- Sync IdP group membership to Chronicle permission groups.\n- Revoke sessions/access on deprovision events.' \
$'- [ ] SCIM creates, updates, disables users and groups.\n- [ ] Group sync updates permissions without manual steps.\n- [ ] Deprovisioned users lose access immediately.' \
$'- Integration: SCIM contract tests.\n- Security tests: authentication and scope checks.\n- Regression tests for deprovision session revocation.'

create_issue "RM-009" "Blame View (Paragraph-Level Attribution)" "roadmap-versioning" "P1" "v1.1" \
"Teams need paragraph-level provenance to trace decisions and authorship." \
$'- `api/internal/gitrepo/*`\n- `api/internal/app/service.go`\n- `src/views/WorkspacePage.tsx`' \
$'- Compute block/paragraph blame from commit history.\n- Expose blame endpoint with author/time/hash metadata.\n- Add hover and jump-to-commit behavior in UI.' \
$'- [ ] Users can inspect who last changed each block.\n- [ ] Blame links to commit and related discussion context.\n- [ ] Performance is acceptable on long documents.' \
$'- Unit: blame mapping algorithm.\n- Integration: blame API payloads.\n- E2E: hover-to-details and jump flow.'

create_issue "RM-010" "Document Templates Library" "roadmap-editor" "P1" "v1.1" \
"Template-driven starts reduce authoring overhead and standardize governance docs." \
$'- `api/internal/templates/*`\n- `src/views/DocumentsPage.tsx`\n- `src/editor/schema.ts`' \
$'- Implement template storage, versioning, and retrieval APIs.\n- Add template picker to create-document flow.\n- Seed core templates (RFC, ADR, Runbook, Incident, etc.).' \
$'- [ ] Users can create documents from templates.\n- [ ] Template updates are versioned and reversible.\n- [ ] Seed templates cover v1 list.' \
$'- Integration: template CRUD + instantiation.\n- E2E: create-from-template journey.'

create_issue "RM-011" "Backlinks and Document Graph" "roadmap-collab" "P1" "v1.1" \
"Cross-document linking requires automatic backlink tracking for navigation and context." \
$'- `api/internal/linkgraph/*`\n- `api/internal/search/*`\n- `src/views/WorkspacePage.tsx`' \
$'- Parse internal links and maintain reverse-link index.\n- Expose backlinks in document view.\n- Recompute graph on document updates.' \
$'- [ ] Backlinks update automatically when links change.\n- [ ] Users can navigate linked documents bidirectionally.' \
$'- Integration: link parse/index refresh.\n- E2E: create links and verify backlink panel.'

create_issue "RM-012" "Slack and Microsoft Teams Notifications" "roadmap-notifications" "P1" "v1.1" \
"Roadmap requires actionable collaboration notifications across Slack/Teams." \
$'- `api/internal/notifications/*`\n- `api/internal/app/service.go`\n- `src/views/WorkspacePage.tsx`' \
$'- Add Slack and Teams connector configuration.\n- Emit events for approval requests, resolved threads, publication.\n- Support actionable deep links from notifications.' \
$'- [ ] Connected channels receive configured events.\n- [ ] Notification payloads include actionable links.\n- [ ] Retry/failed-delivery telemetry is available.' \
$'- Integration: provider adapters.\n- Contract tests: payload shape.\n- E2E: approval request generates notification.'

create_issue "RM-013" "Approval Delegation Workflow" "roadmap-governance" "P1" "v1.1" \
"Approvers must delegate responsibility with auditability in governance flows." \
$'- `api/internal/approvals/*`\n- `api/internal/store/*`\n- `src/ui/ApprovalChain.tsx`' \
$'- Implement delegation action with reason + effective dates.\n- Record delegation chain in audit trail.\n- Reflect delegated responsibilities in merge gate logic.' \
$'- [ ] Delegated approvers can act on assigned stage.\n- [ ] Delegation chain is visible and auditable.\n- [ ] Merge gate evaluates delegated approvals correctly.' \
$'- Integration: delegation state transitions.\n- E2E: delegate -> approve -> merge.'

create_issue "RM-014" "Approval Reminder and Escalation Workflows" "roadmap-governance" "P1" "v1.1" \
"Stalled approvals need automated reminders and escalations." \
$'- `api/internal/approvals/*`\n- `api/internal/notifications/*`\n- `api/internal/store/*`' \
$'- Implement scheduler for reminder cadences.\n- Add escalation rules to backup approvers.\n- Log reminder/escalation events in audit stream.' \
$'- [ ] Pending approvers receive reminders per policy.\n- [ ] Escalations trigger when SLA windows expire.\n- [ ] Events are auditable and observable.' \
$'- Integration: scheduling and escalation tests.\n- E2E: forced-expiry escalation scenario.'

create_issue "RM-015" "Helm Chart for Kubernetes Deployment" "roadmap-platform" "P1" "v1.1" \
"Enterprise self-hosting requires first-class Kubernetes deployment support." \
$'- `deploy/helm/*` (new)\n- `docker/*`\n- `docs/runbooks/*`' \
$'- Create Helm chart for all Chronicle services.\n- Add values for scaling, storage, and secrets.\n- Provide upgrade and rollback runbook.' \
$'- [ ] Fresh install and upgrade work on reference cluster.\n- [ ] Horizontal scaling supported for API and sync.\n- [ ] Chart docs cover required values and defaults.' \
$'- Deployment smoke tests in CI/staging.\n- Rollback validation tests.'

create_issue "RM-016" "Chronicle Cloud Managed Hosting Baseline" "roadmap-cloud" "P1" "v1.1" \
"Managed hosting launch needs tenant lifecycle, ops controls, and billing-ready boundaries." \
$'- `api/internal/tenancy/*`\n- `api/internal/config/*`\n- `docs/runbooks/*`' \
$'- Implement tenant provisioning baseline and org isolation.\n- Add cloud ops controls for lifecycle management.\n- Define cloud-specific configuration and observability baselines.' \
$'- [ ] New tenant provisioning is automated and repeatable.\n- [ ] Tenant isolation boundaries are enforced.\n- [ ] Runbooks cover incident and recovery basics.' \
$'- Integration tests for tenant lifecycle.\n- Security tests for cross-tenant isolation.'

create_issue "RM-017" "AI Drafting Assistant with Tracked Changes" "roadmap-ai" "P1" "v2.0" \
"AI drafting is a v2.0 feature and must produce reviewable tracked-change suggestions, not silent edits." \
$'- `api/internal/ai/*`\n- `src/editor/extensions/suggestion-mode.ts`\n- `src/editor/EditorToolbar.tsx`' \
$'- Integrate configurable LLM provider abstraction.\n- Generate suggestions as proposal/track-change artifacts.\n- Add accept/reject UX and audit events for AI actions.' \
$'- [ ] AI output appears as tracked suggestions only.\n- [ ] Users can accept/reject changes per suggestion.\n- [ ] Model/provider config is environment-driven.' \
$'- Integration: provider adapter and fallback tests.\n- E2E: generate suggestion and apply/reject.'

create_issue "RM-018" "DocuSign and HelloSign Integration" "roadmap-integrations" "P1" "v2.0" \
"Legal workflows need integrated signature envelopes tied to Chronicle versions." \
$'- `api/internal/esign/*`\n- `api/internal/storage/*`\n- `src/views/WorkspacePage.tsx`' \
$'- Implement provider abstraction for DocuSign/HelloSign.\n- Trigger envelope creation from approved document version.\n- Persist signed artifact and signature metadata with audit linkage.' \
$'- [ ] Envelope can be initiated from Chronicle document.\n- [ ] Signed output is stored and version-linked.\n- [ ] Signature status is visible in document workflow.' \
$'- Integration: provider mock contract tests.\n- E2E: initiate and complete signature loop (sandbox provider).'

create_issue "RM-019" "Advanced Audit Log and Compliance Reporting" "roadmap-compliance" "P0" "v2.0" \
"Enterprise/regulatory customers require queryable compliance reports and exportable audit evidence." \
$'- `api/internal/audit/*`\n- `api/internal/app/http.go`\n- `src/views/WorkspacePage.tsx`' \
$'- Expand audit event model for governance and access events.\n- Add report APIs for time/user/document/action filters.\n- Implement exportable compliance report outputs.' \
$'- [ ] Audit queries return complete event trails.\n- [ ] Compliance reports are filterable and exportable.\n- [ ] Sensitive events include actor/resource context.' \
$'- Integration: audit query/report generation.\n- Security tests for report access control.\n- E2E: admin compliance report flow.'

create_issue "RM-020" "Enterprise Sharing Controls Pack" "roadmap-permissions" "P0" "v2.0" \
"Enterprise sharing controls (time-limited access, legal hold, domain restrictions, watermarking) are required for regulated use cases." \
$'- `api/internal/permissions/*`\n- `api/internal/app/service.go`\n- `src/views/WorkspacePage.tsx`' \
$'- Implement time-limited external access expiry.\n- Implement legal hold guardrails on delete/archive/export.\n- Enforce domain-restricted invitations and dynamic watermarking.' \
$'- [ ] Expiring access revokes automatically and is audited.\n- [ ] Legal hold blocks destructive actions.\n- [ ] Domain policy and watermark rules enforce correctly.' \
$'- Integration: policy enforcement matrix.\n- Security tests for bypass attempts.\n- E2E: external-share lifecycle with expiry.'

create_issue "RM-021" "Data Residency Controls" "roadmap-compliance" "P0" "v2.0" \
"Regional data residency is required for enterprise and regulated industries." \
$'- `api/internal/config/*`\n- `api/internal/storage/*`\n- `docs/runbooks/*`' \
$'- Add region-aware deployment/storage routing configuration.\n- Ensure data and backups remain region-bound per tenant policy.\n- Expose residency metadata in admin settings and audit.' \
$'- [ ] Tenant residency policy is configurable and enforced.\n- [ ] Data path and backup path stay within region boundaries.\n- [ ] Residency setting changes are auditable.' \
$'- Integration: region routing tests.\n- Compliance tests for region boundary enforcement.'

create_issue "RM-022" "Client Portal External Collaboration Experience" "roadmap-client-portal" "P1" "v2.0" \
"Client portal mode must expose external collaboration without leaking internal deliberation." \
$'- `api/internal/permissions/*`\n- `api/internal/app/service.go`\n- `src/views/WorkspacePage.tsx`' \
$'- Add external-view workspace mode with strict visibility projection.\n- Implement external sign-off/request-change UX.\n- Ensure internal threads/history/user list are excluded externally.' \
$'- [ ] External users see only permitted content and threads.\n- [ ] Internal users retain full governance context.\n- [ ] External sign-off actions are captured in audit trail.' \
$'- Integration: internal/external payload parity tests.\n- E2E: internal + external side-by-side journey.'

create_issue "RM-023" "Whiteboards v1" "roadmap-editor" "P2" "v2.0" \
"Whiteboards are on the v2.0 roadmap for mixed-mode collaborative ideation." \
$'- `src/views/*` (new whiteboard route)\n- `api/internal/app/*`\n- `api/internal/store/*`' \
$'- Define whiteboard document type and persistence model.\n- Add core canvas interactions and collaboration session model.\n- Integrate with workspace navigation and permissions.' \
$'- [ ] Users can create/open/edit collaborative whiteboards.\n- [ ] Permissions and sharing model match document governance baseline.' \
$'- Unit: canvas primitives.\n- Integration: whiteboard CRUD.\n- E2E: collaborative editing smoke.'

create_issue "RM-024" "Jira and Linear Deep Integration" "roadmap-integrations" "P1" "v2.0" \
"Deep PM integrations are required for enterprise workflow continuity." \
$'- `api/internal/integrations/*`\n- `src/editor/extensions/*`\n- `src/views/WorkspacePage.tsx`' \
$'- Implement OAuth/app connectors for Jira and Linear.\n- Support linked issues, status previews, and deep references in editor.\n- Add sync/update hooks for linked item state changes.' \
$'- [ ] Users can link Jira/Linear issues from documents.\n- [ ] Linked status metadata displays and refreshes.\n- [ ] Permission and token scopes are enforced.' \
$'- Integration: connector contract tests.\n- E2E: link issue and view status sync.'

create_issue "RM-025" "Plugin and Extension Marketplace (Early)" "roadmap-platform" "P2" "v2.0" \
"Marketplace support enables ecosystem growth and custom extensions." \
$'- `api/internal/plugins/*`\n- `src/views/*` (admin/extensions UI)\n- `docs/specs/*`' \
$'- Define extension manifest, install, and lifecycle contracts.\n- Implement sandboxed execution boundaries.\n- Add admin UI for enable/disable and version management.' \
$'- [ ] Extensions install/upgrade/remove safely.\n- [ ] Plugin execution is sandboxed and permission-bounded.\n- [ ] Admin can audit enabled extensions.' \
$'- Security tests for plugin isolation.\n- Integration: lifecycle operations.\n- E2E: install and use sample extension.'

create_issue "RM-026" "Mobile Apps (iOS and Android)" "roadmap-mobile" "P2" "v2.0" \
"Mobile apps are required for roadmap completeness and field collaboration workflows." \
$'- `mobile/` (new app clients)\n- `api/internal/app/http.go`\n- `docs/runbooks/*`' \
$'- Define mobile API compatibility surface and auth flow.\n- Implement MVP read/comment/approve document flows.\n- Add offline draft/reconnect behavior for essential operations.' \
$'- [ ] Mobile users can sign in and access assigned documents.\n- [ ] Comment/approve flows work with audit parity.\n- [ ] Offline edits sync without data loss for supported actions.' \
$'- Mobile integration tests (API + client).\n- E2E smoke on iOS/Android simulators.'

echo "Done."
