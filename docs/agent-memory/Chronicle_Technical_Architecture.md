**Chronicle**

Technical Architecture

*No hacks. No half-measures. No technical debt.*

|                             |                                       |                           |                                                 |
|-----------------------------|---------------------------------------|---------------------------|-------------------------------------------------|
| **Backend**                 | **Frontend**                          | **Real-time**             | **Database**                                    |
| **Go**                      | **TipTap + ProseMirror**              | **Yjs (CRDT)**            | **PostgreSQL + Meilisearch + Redis**            |
| **Deployment**              | **Auth**                              | **Git storage**           | **Editor storage**                              |
| **Docker Compose (single)** | **Email / Google OAuth / Magic link** | **One repo per document** | **Markdown in Git + Yjs snapshots in Postgres** |

**1. Architecture Overview**

Chronicle is a document collaboration platform that must solve three hard problems simultaneously: real-time collaborative editing, Git-native version control with branch-based proposals, and a permanent structured deliberation layer. Each problem is independently complex. The architecture treats all three as first-class concerns from day one.

|                                                                                                                                                                                                                                                                                                                         |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *The central constraint: Git is a commit-based system operating at the granularity of sessions. Yjs operates at the granularity of individual characters. These two systems serve different purposes and must never be conflated. The architecture's primary job is to define a clean, reliable boundary between them.* |

**1.1 System Layers**

Chronicle is six discrete layers. Each layer has one responsibility. No layer reaches across to a non-adjacent layer. This is a hard rule, not a preference.

|                                                                      |
|----------------------------------------------------------------------|
| **Client Layer** React 18 + TipTap/ProseMirror + Yjs (y-prosemirror) |
| **Sync Gateway** Node.js + y-websocket + JWT auth + Redis pub/sub    |
| **API Server** Go + Fiber + JWT middleware + RBAC                    |
| **Git Service** Go + go-git (pure Go, no CGO, no shell-out)          |
| **Data Layer** PostgreSQL 16 + Meilisearch + Redis 7                 |
| **Object Store** S3-compatible: MinIO (self-host) / AWS S3 (cloud)   |

**1.2 Why Two Separate Backend Services**

The API Server is Go. The Sync Gateway is Node.js. This is intentional and should not be collapsed.

<table><tbody><tr class="odd"><td><p><strong>API Server: Go</strong></p><p>Business logic, permissions, approval chains, decision log, notifications</p><p>Stateless. Scales horizontally. Each request is independent.</p><p>go-git handles all Git operations natively — no subprocess risk</p><p>Compiles to a single binary. Self-hosting requires no runtime.</p><p>Row-level security enforced here before any data reaches the client</p></td><td><p><strong>Sync Gateway: Node.js</strong></p><p>Yjs real-time collaboration only — this is its entire purpose</p><p>Stateful: holds live Y.Doc instances in memory for open documents</p><p>Yjs is JavaScript-native. The Go bindings are immature. Wrong tool.</p><p>Communicates with API Server over internal HTTP — never touches DB directly</p><p>Redis pub/sub allows multiple Sync Gateway instances to coordinate</p></td></tr></tbody></table>

|                                                                                                                                                                                                                                                                                             |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *The Sync Gateway is a dumb pipe with one smart rule: it validates identity (JWT), enforces write permission, and synchronises CRDT state. It makes no business logic decisions. It never writes to PostgreSQL directly. All business events are fired to the Go API via internal webhook.* |

**1.3 The Yjs ↔ Git Boundary**

This is the most important design decision in the system. Getting it wrong means either losing edits or creating meaningless Git history. The contract is:

-   **Active session** — While a document is actively being edited: Yjs is source of truth. Git is not involved.

-   **Auto-save** — Auto-save: Every 30 seconds of activity, the Sync Gateway persists a Y.Doc binary snapshot to PostgreSQL (yjs\_snapshots table). This is crash recovery, not version history.

-   **Draft commit** — Draft commit: 60 seconds after the last connected user leaves a document, the Sync Gateway fires a "session ended" event to the Go API. The API serialises the Y.Doc snapshot → ProseMirror JSON → Markdown and commits it to Git with a generated message. This is the automatic background commit the user never sees.

-   **Named version** — Named version: When a user explicitly clicks "Save version" and names it, the API creates a Git tag at the current HEAD commit. This is what appears in the version history panel. Users interact with named versions, not raw commits.

|                                                                                                                                                                                                                                                                                                         |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *Invariant: No editing session can end without its content being committed to Git within 65 seconds. The yjs\_updates\_log table captures every Yjs update as it arrives at the Sync Gateway. If the flush pipeline fails, the updates log is the recovery source. Nothing is ever silently discarded.* |

**2. Technology Decisions**

Every decision below was made against three criteria: is this the correct tool for the specific job, is it self-hostable without operational complexity, and will we regret it in three years. No decision was made for novelty.

**2.1 Backend: Go**

<table><tbody><tr class="odd"><td><strong>DECISION · Backend language</strong></td></tr><tr class="even"><td><p><strong>✓ Go</strong></p><p>Go compiles to a single static binary with no runtime dependency. Docker image is scratch + binary. Self-hosting is genuinely simple. Goroutines handle WebSocket fan-out and concurrent Git operations cleanly. go-git is a pure Go Git implementation — no CGO, no subprocess risk, proper error handling. The type system prevents the most common classes of runtime bugs. Hiring is narrower than Node.js but Go engineers are exactly the kind of people who will care about Chronicle's correctness requirements.</p></td></tr></tbody></table>

<table><tbody><tr class="odd"><td><p><strong>Go service structure</strong></p><ul><li><p><strong>cmd/api:</strong> Main API server entry point. Fiber HTTP framework. JWT middleware. Route registration.</p></li><li><p><strong>cmd/sync-trigger:</strong> Lightweight process that fires session-ended events from Sync Gateway callback</p></li><li><p><strong>internal/auth:</strong> JWT generation, validation, SAML/OIDC handlers, session management</p></li><li><p><strong>internal/documents:</strong> Document CRUD, branch management, diff rendering, merge gate</p></li><li><p><strong>internal/git:</strong> All go-git operations: commit, branch, tag, merge, diff. Isolated behind interface for testing.</p></li><li><p><strong>internal/deliberation:</strong> Threads, annotations, decision log, resolution workflows</p></li><li><p><strong>internal/approvals:</strong> Approval chain evaluation, gate checking, notification dispatch</p></li><li><p><strong>internal/permissions:</strong> RBAC evaluation, materialised permission view, row-level security</p></li><li><p><strong>internal/search:</strong> Meilisearch indexing and query. Falls back to PostgreSQL FTS if Meilisearch unavailable.</p></li><li><p><strong>internal/storage:</strong> S3-compatible object store abstraction. MinIO in dev, any S3-compatible in prod.</p></li><li><p><strong>internal/notifications:</strong> Email, webhook, and Redis pub/sub event dispatch</p></li></ul></td></tr></tbody></table>

**2.2 Frontend Editor: TipTap + Raw ProseMirror**

<table><tbody><tr class="odd"><td><strong>DECISION · Editor engine</strong></td></tr><tr class="even"><td><p><strong>✓ TipTap as scaffold, ProseMirror primitives for Chronicle-specific features</strong></p><p>TipTap provides slash commands, block handles, tables, mentions, keyboard shortcuts, and the React component model — saving 4-6 weeks of foundational work. For the three features unique to Chronicle (block-anchored annotation anchors, branch diff decorations, suggestion/proposal mode), we write raw ProseMirror plugins that access the underlying editor instance directly. TipTap exposes editor.view and editor.state — the full ProseMirror API is available. We are not constrained by the abstraction.</p></td></tr></tbody></table>

<table><tbody><tr class="odd"><td><p><strong>Use TipTap for</strong></p><p>Block type menu (slash commands)</p><p>Drag-and-drop block reordering</p><p>Table extension (complex, well-tested)</p><p>Mention extension (@users)</p><p>Link extension</p><p>Code block with syntax highlighting</p><p>Keyboard shortcut system</p><p>React component bindings</p></td><td><p><strong>Use raw ProseMirror for</strong></p><p>Block node ID system (persistent anchor IDs)</p><p>Thread highlight decorations (annotation markers)</p><p>Diff decorations (green/red/amber overlays from Git diff)</p><p>Suggestion mode (proposal changes as ProseMirror marks)</p><p>Read-only enforcement per-node (external guest restrictions)</p><p>Custom copy/paste handling for document export</p></td></tr></tbody></table>

**Node ID System — Critical Detail**

Every block-level ProseMirror node must have a persistent nodeId attribute. This is the anchor for the entire deliberation system. Threads attach to node IDs, not to text content or positions.

> // ProseMirror plugin: assign nodeId on node creation
>
> const nodeIdPlugin = new Plugin({
>
> appendTransaction(trs, oldState, newState) {
>
> let tr = newState.tr;
>
> let modified = false;
>
> newState.doc.descendants((node, pos) =&gt; {
>
> if (node.isBlock && !node.attrs.nodeId) {
>
> tr.setNodeMarkup(pos, null, {
>
> ...node.attrs,
>
> nodeId: crypto.randomUUID()
>
> });
>
> modified = true;
>
> }
>
> });
>
> return modified ? tr : null;
>
> }
>
> });

|                                                                                                                                                                                                                                                                                                        |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *nodeId is never changed after creation. If a block is split, both resulting nodes get new IDs. If blocks merge, the surviving node keeps the first block's ID. Thread anchors survive all edits except block deletion — orphaned threads are preserved with a visual indicator, never silently lost.* |

**2.3 Real-Time: Yjs**

<table><tbody><tr class="odd"><td><strong>DECISION · Real-time collaboration</strong></td></tr><tr class="even"><td><p><strong>✓ Yjs CRDT with y-prosemirror binding</strong></p><p>Yjs is the production-proven CRDT library for collaborative editing. It powers Notion-style apps, has a mature ProseMirror binding (y-prosemirror), handles network partitions correctly (offline edits merge cleanly on reconnect), and is MIT licensed. The alternative (Automerge) has a Rust/WASM core with excellent properties but a smaller ecosystem and fewer production deployments at Chronicle's target scale. Operational Transformation is the older approach — correct but harder to implement correctly under network partitions.</p></td></tr></tbody></table>

<table><tbody><tr class="odd"><td><p><strong>Yjs integration stack</strong></p><ul><li><p><strong>Y.Doc:</strong> One per open document session. The in-memory CRDT document. Shared across all connected clients.</p></li><li><p><strong>y-prosemirror:</strong> Bidirectional binding. ProseMirror changes → Yjs ops. Yjs ops → ProseMirror transactions. This is the core integration.</p></li><li><p><strong>y-websocket (server):</strong> WebSocket provider running in the Sync Gateway. Broadcasts Yjs updates between connected clients.</p></li><li><p><strong>y-websocket (client):</strong> Client-side provider. Connects to Sync Gateway. Handles reconnection and initial sync automatically.</p></li><li><p><strong>Y.Awareness:</strong> Ephemeral real-time state: cursor positions, user presence, "is typing" indicators. Separate channel from document state.</p></li><li><p><strong>y-indexeddb:</strong> Client-side IndexedDB persistence. Documents load instantly on revisit. Offline edits are queued and synced on reconnect.</p></li></ul></td></tr></tbody></table>

**2.4 Database: PostgreSQL + Meilisearch + Redis**

Three tools, each for its best purpose. This is not over-engineering — each solves a problem the others handle poorly.

|                   |                                                                                                                                                                             |                                                                                                      |
|-------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| **Store**         | **What it owns**                                                                                                                                                            | **What it never owns**                                                                               |
| **PostgreSQL 16** | Users, groups, permissions, spaces, document metadata, threads, annotations, approvals, decision log, Yjs snapshots, audit log, notification queue, embed cache, SCIM state | Document content, version history, file attachments                                                  |
| **Meilisearch**   | Full-text search index over document content and annotations. Typo-tolerant, sub-10ms. Single binary, self-hostable.                                                        | Persistent data of any kind — Meilisearch is a derived index, always rebuildable from Postgres + Git |
| **Redis 7**       | WebSocket session cache, JWT validation cache (5min TTL), Sync Gateway pub/sub for multi-instance coordination, rate limiting counters, notification queue fan-out          | Any data that cannot be reconstructed — Redis is ephemeral by design                                 |
| **Git (go-git)**  | Document content history, branches, diffs, named versions, merge records, commit attribution                                                                                | Operational metadata — Git has no concept of users, permissions, or threads                          |
| **MinIO / S3**    | File attachments, image uploads, PDF exports, document archive exports, embed thumbnails cache                                                                              | Text content — only binary and large objects                                                         |

**PostgreSQL Row-Level Security**

Permission enforcement happens at the database layer, not only in application code. This is belt-and-suspenders security — even if application logic has a bug, the database will not return rows the requesting user is not authorised to see.

> -- Every query runs as the application user with RLS enabled
>
> -- The app sets the current user context at connection time:
>
> SET LOCAL app.current\_user\_id = '&lt;uuid&gt;';
>
> SET LOCAL app.is\_external = 'true';
>
> -- Threads policy: external users never see INTERNAL threads
>
> CREATE POLICY threads\_visibility ON threads
>
> USING (
>
> visibility = 'EXTERNAL'
>
> OR current\_setting('app.is\_external')::bool = false
>
> );
>
> -- DecisionLog is append-only: no UPDATE or DELETE ever
>
> CREATE RULE decision\_log\_no\_update AS ON UPDATE TO decision\_log DO INSTEAD NOTHING;
>
> CREATE RULE decision\_log\_no\_delete AS ON DELETE TO decision\_log DO INSTEAD NOTHING;

**2.5 Git Storage: One Repository Per Document**

<table><tbody><tr class="odd"><td><strong>DECISION · Git storage model</strong></td></tr><tr class="even"><td><p><strong>✓ One bare Git repository per document</strong></p><p>Permissions are naturally document-scoped. Exporting or archiving one document's complete history is a single git bundle. A corrupted repository affects one document, not a workspace. Large attachment history in one document (stored in S3, not Git) does not affect clone performance of others. At scale, thousands of small repositories are operationally simpler than one monorepo that requires path-scoped permissions. go-git opens repositories as in-memory objects — the filesystem layout is just directories.</p></td></tr></tbody></table>

<table><tbody><tr class="odd"><td><p><strong>Repository layout on disk</strong></p><ul><li><p><strong>Path:</strong> /repos/{workspace_id}/{document_id}.git (bare repository)</p></li><li><p><strong>main branch:</strong> The live document. Protected. Never pushed to directly by users.</p></li><li><p><strong>proposals/{uuid}:</strong> Proposal branches. Created programmatically. Deleted after merge or rejection.</p></li><li><p><strong>content.md:</strong> The document in Markdown. The only file in the repository.</p></li><li><p><strong>Git tags:</strong> Named versions: "Partner-Review-Draft", "v2.0-Approved". Created on explicit save.</p></li><li><p><strong>Commit message format:</strong> "[auto] Sarah R. edited Introduction, Fees section | session:abc123"</p></li><li><p><strong>No binary files:</strong> Attachments go to S3. Git only ever stores Markdown text. Repositories stay small forever.</p></li></ul></td></tr></tbody></table>

**3. Data Model**

The data model is the foundation everything else is built on. Mistakes here compound into rewrites. Every table below was designed for the specific requirements of a document governance system — not a CMS, not a wiki.

**3.1 Core Entities**

|                        |                                                                                                               |                                                                                                                |
|------------------------|---------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| **Entity**             | **Key fields**                                                                                                | **Notes**                                                                                                      |
| **workspaces**         | id, name, slug, git\_root\_path, settings\_json                                                               | One per organisation. Owns all spaces and users.                                                               |
| **spaces**             | id, workspace\_id, name, slug, default\_permissions\_json, approval\_template\_id                             | Container for documents. Owns permission defaults.                                                             |
| **documents**          | id, space\_id, title, status, git\_repo\_path, current\_branch, approval\_chain\_json, governance\_level      | The central entity. git\_repo\_path points to the bare repo on disk.                                           |
| **document\_versions** | id, document\_id, git\_commit\_hash, name, created\_by, created\_at                                           | Immutable. Points to a commit. Named versions are also Git tags.                                               |
| **branches**           | id, document\_id, git\_branch\_name, title, status, author\_id, target\_branch, created\_at, merged\_at       | status: DRAFT \| UNDER\_REVIEW \| APPROVED \| MERGED \| REJECTED                                               |
| **branch\_approvals**  | id, branch\_id, approver\_id, approved\_at, document\_content\_hash, ip\_address                              | Content hash enables cryptographic proof document unchanged since approval.                                    |
| **threads**            | id, document\_id, branch\_id (nullable), anchor\_node\_id, anchor\_offsets\_json, visibility, status, type    | visibility: INTERNAL \| EXTERNAL. status: OPEN \| RESOLVED. anchor survives edits.                             |
| **annotations**        | id, thread\_id, author\_id, body, type, tracked\_change\_id (nullable), created\_at                           | type: GENERAL \| LEGAL \| COMMERCIAL \| TECHNICAL \| SECURITY \| QUERY \| EDITORIAL                            |
| **decision\_log**      | id, thread\_id, document\_id, outcome, rationale, decided\_by, decided\_at, document\_version\_at\_decision   | Append-only. DB rules block UPDATE and DELETE.                                                                 |
| **users**              | id, workspace\_id, email, display\_name, is\_external, scoped\_document\_ids (external only), auth\_provider  | Internal and external guests in same table. is\_external drives RLS policies.                                  |
| **groups**             | id, workspace\_id, name, scim\_external\_id (nullable)                                                        | Groups receive permission grants. Synced from IdP via SCIM.                                                    |
| **permissions**        | id, subject\_type (user\|group), subject\_id, resource\_type (workspace\|space\|document), resource\_id, role | role: VIEWER \| COMMENTER \| SUGGESTER \| EDITOR \| ADMIN. Materialised view for fast eval.                    |
| **audit\_log**         | id, workspace\_id, actor\_id, action, resource\_type, resource\_id, metadata\_json, ip, timestamp             | Append-only. Never deleted. Legal hold status blocks even soft deletes.                                        |
| **yjs\_snapshots**     | id, document\_id, branch\_id, snapshot\_bytes, vector\_clock, updated\_at                                     | Binary Y.Doc snapshots. Latest per document/branch. Recovery source if flush fails.                            |
| **yjs\_updates\_log**  | id, document\_id, branch\_id, update\_bytes, received\_at                                                     | Every Yjs update, in order. Used to reconstruct state if snapshot is lost. Pruned after successful Git commit. |

**3.2 Critical Schema Rules**

These are non-negotiable invariants enforced at the database layer, not just in application code.

-   **Immutable deliberation record** — decision\_log is physically append-only. PostgreSQL RULEs block UPDATE and DELETE. No application code can override this.

-   **Tamper-evident approvals** — branch\_approvals.document\_content\_hash stores SHA-256 of content.md at approval time. Provides cryptographic evidence document was not modified after approval.

-   **Soft deletes** — Soft deletes only. All tables have a deleted\_at column. Hard deletes are never executed. Legal hold flag prevents even soft deletes.

-   **UTC timestamps** — All timestamps are stored as UTC timestamptz. No exceptions. The client converts to local time.

-   **Durable anchors** — threads.anchor\_node\_id references ProseMirror node IDs, never line numbers or character offsets. Node IDs survive document edits.

-   **Fast permissions** — permissions is evaluated against a materialised view (mv\_effective\_permissions) that is refreshed on any permission change. O(1) permission checks per request, not O(n) joins.

-   **External visibility enforced at DB** — External users (is\_external=true) are governed by RLS policies. INTERNAL threads are never returned in queries from external sessions regardless of application logic.

**4. Real-Time Collaboration Layer**

The real-time layer is the most operationally complex part of Chronicle. It must handle concurrent edits at millisecond granularity, survive network partitions, scale horizontally, and flush reliably to Git without data loss.

**4.1 Sync Gateway Architecture**

<table><tbody><tr class="odd"><td><p><strong>Sync Gateway responsibilities</strong></p><ul><li><p><strong>WebSocket upgrade:</strong> Validate JWT on HTTP upgrade. Reject unauthorised connections before any Yjs state is shared.</p></li><li><p><strong>Permission check:</strong> Call Go API: can this user edit this document/branch? Read-only users get y-websocket in awareness-only mode.</p></li><li><p><strong>Room management:</strong> One Yjs room per (document_id, branch_id) pair. Room created on first connection, kept alive while users are connected.</p></li><li><p><strong>State bootstrap:</strong> On room creation: load latest yjs_snapshots from Postgres. If no snapshot, call Go API to get Markdown → serialise as initial Y.Doc.</p></li><li><p><strong>Update broadcast:</strong> Receive Yjs update from one client → broadcast to all other clients in the room via y-websocket protocol.</p></li><li><p><strong>Redis fan-out:</strong> If multiple Sync Gateway instances: publish updates to Redis channel. Other instances subscribe and relay to their local clients.</p></li><li><p><strong>Snapshot persistence:</strong> Every 30s and on room close: serialise Y.Doc → save binary to yjs_snapshots table via internal Go API call.</p></li><li><p><strong>Session-ended event:</strong> 60s after last client disconnects: POST to Go API /internal/session-ended. Go API handles Git commit.</p></li><li><p><strong>Updates log:</strong> Every received Yjs update: INSERT into yjs_updates_log. This is the recovery table. Pruned after successful Git commit confirmation.</p></li></ul></td></tr></tbody></table>

**4.2 Git Flush Pipeline**

This pipeline runs in the Go API, triggered by the session-ended event from the Sync Gateway. It must be idempotent — safe to run multiple times for the same session.

|                          |                                                                                          |                                                                                           |
|--------------------------|------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| **Step**                 | **Action**                                                                               | **Failure handling**                                                                      |
| **1. Deduplicate**       | Check: has this session already been committed? (session\_id in commits table)           | If yes: no-op, return 200. Idempotent.                                                    |
| **2. Load snapshot**     | Fetch latest yjs\_snapshot bytes for this document/branch from Postgres                  | If missing: reconstruct from yjs\_updates\_log. If both missing: alert + skip.            |
| **3. Serialise**         | Y.Doc binary → ProseMirror JSON (via embedded JS runtime: goja) → Markdown               | Serialisation error: log, flag document, do not commit partial content.                   |
| **4. Diff check**        | Compare new Markdown against git HEAD of branch                                          | If diff is empty: record no-op commit, skip git write. Never create empty commits.        |
| **5. Git commit**        | go-git: stage content.md, commit with author attribution, timestamp, session summary     | Retry 3x with exponential backoff. On persistent failure: queue for manual review, alert. |
| **6. Search index**      | Send new content to Meilisearch indexer async                                            | Non-fatal. Meilisearch catch-up job re-indexes on next commit.                            |
| **7. Prune updates log** | DELETE FROM yjs\_updates\_log WHERE document\_id = ? AND received\_at &lt;= commit\_time | Non-fatal if pruning fails. Updates log grows until next successful commit.               |
| **8. Broadcast**         | Notify all document subscribers: new version available                                   | Non-fatal. Clients poll on reconnect.                                                     |

**4.3 Conflict Resolution**

Chronicle has two distinct conflict scenarios with different resolution strategies.

**Within a live session (Yjs handles automatically)**

Two users typing in the same paragraph simultaneously. Yjs CRDT merges both sets of changes correctly and deterministically. No conflict dialogue, no lost edits. The algorithm guarantees convergence — both clients end up with the same document state.

**Between proposal branches at merge time**

Two proposals both modify the same paragraph. The second to merge encounters a conflict. go-git performs a three-way merge (proposal HEAD vs main HEAD vs common ancestor). If the merge is clean, it proceeds automatically. If not:

-   The merge is blocked. The proposal author is notified.

-   Chronicle renders a visual conflict UI: three panels — current main, the proposal, and the conflicting region highlighted.

-   The author picks one side or edits a combined version in the conflict editor.

-   Resolution is committed to the proposal branch. The proposal re-enters the approval flow.

-   No silent overwrites. No last-write-wins. Every conflict is explicitly resolved by a human.

**5. Version Control & Branch Model**

Chronicle's version control is standard Git underneath. The vocabulary presented to users is document-native. An engineer looking at the bare repository directly should find it immediately comprehensible.

**5.1 Vocabulary Mapping**

|                                |                                 |                                                                                                    |
|--------------------------------|---------------------------------|----------------------------------------------------------------------------------------------------|
| **Chronicle (what users see)** | **Git (what actually happens)** | **Details**                                                                                        |
| **Document (main)**            | main branch                     | Protected. Never pushed to directly. All changes via proposal merge.                               |
| **Named version**              | Annotated Git tag               | "Partner-Review-Draft" = tag pointing to a specific commit hash. Immutable.                        |
| **Propose a change**           | Create branch proposals/{uuid}  | Branch is created off current main HEAD. Author begins editing on this branch.                     |
| **Submit for review**          | Open proposal (internal state)  | Branch status → UNDER\_REVIEW. Required approvers notified.                                        |
| **Approve**                    | Record approval                 | branch\_approvals row inserted with content hash. Enables merge when all approvers done.           |
| **Merge**                      | git merge into main             | go-git merge commit. Branch deleted. main updated. Readers see new version immediately.            |
| **Reject**                     | Close proposal                  | Branch status → REJECTED. Branch retained but marked. Not deletable.                               |
| **Restore to version**         | New branch from tag/commit      | Creates proposals/{uuid} at the selected commit. User reviews diff, merges. No destructive resets. |
| **Compare versions**           | git diff commit\_a commit\_b    | Rendered as visual diff in editor, not raw unified diff text.                                      |

**5.2 Governance Modes**

Different documents have different governance requirements. Chronicle makes this explicit and configurable per space and document.

|                       |                                                                                                             |                                                                 |
|-----------------------|-------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| **Governance level**  | **Edit behaviour**                                                                                          | **Typical use case**                                            |
| **Open (default)**    | Editors write directly to main. No proposals required. Auto-commits on session end.                         | Team wiki, meeting notes, runbooks, working documents           |
| **Proposal-required** | All edits must go through a proposal branch. Direct commits to main blocked.                                | Engineering RFCs, policy documents, contracts under negotiation |
| **Strict (governed)** | Proposals required. Approval chain must be fully satisfied. All threads resolved. Audit log tamper-evident. | Legal documents, board papers, regulated compliance docs        |

**6. Deliberation & Decision Layer**

The deliberation layer is Chronicle's primary differentiator. It is not a comment system bolted onto an editor. It is a structured governance record that is permanent, queryable, and cryptographically linked to specific document states.

**6.1 Thread Lifecycle**

|              |                                                                                               |                                                                       |
|--------------|-----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| **State**    | **Meaning**                                                                                   | **Allowed transitions**                                               |
| **OPEN**     | Active discussion. Blocks merge if thread gate is enabled.                                    | → RESOLVED                                                            |
| **RESOLVED** | Closed with outcome. Never deleted. Decision log entry created.                               | No further transitions. Permanent record.                             |
| **ORPHANED** | Anchor block was deleted from the document. Thread content preserved, visual indicator shown. | Can be manually closed (creates RESOLVED record noting orphan reason) |

**6.2 Decision Log**

Every thread resolution automatically creates an entry in the decision\_log table. This is the institutional memory Chronicle builds that no other tool provides.

<table><tbody><tr class="odd"><td><p><strong>Decision log entry contents</strong></p><ul><li><p><strong>thread_id:</strong> Which discussion this decision resolves</p></li><li><p><strong>document_id + branch_id:</strong> Which document and which proposal (or main) context</p></li><li><p><strong>outcome:</strong> ACCEPTED | REJECTED | DEFERRED — the actual decision</p></li><li><p><strong>rationale:</strong> Free-text explanation written by the person resolving. Required for REJECTED.</p></li><li><p><strong>decided_by:</strong> User who resolved the thread</p></li><li><p><strong>decided_at:</strong> UTC timestamp</p></li><li><p><strong>document_version_at_decision:</strong> Git commit hash at moment of resolution — links decision to exact document state</p></li><li><p><strong>participants:</strong> Array of user IDs who contributed to the thread — for attribution</p></li></ul></td></tr></tbody></table>

|                                                                                                                                                                                       |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *The decision log is queryable across the entire workspace. "Show me every time we changed a payment term and why" is a real query Chronicle can answer. No other document tool can.* |

**6.3 Internal vs External Thread Visibility**

This is security-critical. Enforcement is at three layers — database, API, and client — any one of which is sufficient to prevent leakage.

<table><tbody><tr class="odd"><td><p><strong>INTERNAL threads</strong></p><p>visibility = 'INTERNAL' (default for all new threads)</p><p>DB: RLS policy excludes from any query where app.is_external = true</p><p>API: permission middleware checks is_external before serialising response</p><p>Client: Sync Gateway will not broadcast INTERNAL thread events to external sessions</p><p>Example: "Their GC will push back on this — do we pre-empt?"</p><p>Example: "Partner hasn't signed off on this rate increase yet"</p></td><td><p><strong>EXTERNAL threads</strong></p><p>visibility = 'EXTERNAL' (explicitly set by internal user)</p><p>Visible to external guest users invited to the document</p><p>Visual warning shown to internal users before posting: "This thread is visible to the client"</p><p>External guests can reply to external threads they are party to</p><p>External guests never see internal threads, internal version history, or internal user list</p><p>Example: "Please confirm entity name as per Delaware certificate"</p></td></tr></tbody></table>

**7. Auth & Permissions**

**7.1 Authentication**

|                               |                                                                                                             |          |
|-------------------------------|-------------------------------------------------------------------------------------------------------------|----------|
| **Method**                    | **Implementation**                                                                                          | **v1.0** |
| **Email + password**          | bcrypt hashing (cost 12). Rate-limited login. Secure reset flow via signed time-limited token.              | ✓        |
| **Google OAuth**              | OAuth 2.0 PKCE flow. No dependency on Google for session validity after token exchange.                     | ✓        |
| **Magic link / passwordless** | HMAC-signed link emailed to user. Valid for 15 minutes. One-time use.                                       | ✓        |
| **SAML 2.0 SSO**              | crewjam/saml library. IdP-initiated and SP-initiated flows. Attribute mapping for groups.                   | ✓        |
| **SCIM 2.0**                  | User and group provisioning from IdP. Automatic deprovisioning removes active sessions.                     | ✓        |
| **Session tokens**            | Short-lived JWT (15min) + long-lived refresh token (30 days). Refresh tokens stored in Postgres, revocable. | ✓        |

**7.2 Permission Model**

Permissions are evaluated hierarchically. A more specific grant overrides a more general one in either direction.

|               |              |                 |                 |              |                            |
|---------------|--------------|-----------------|-----------------|--------------|----------------------------|
| **Role**      | **Can read** | **Can comment** | **Can suggest** | **Can edit** | **Can manage permissions** |
| **No Access** | ✗            | ✗               | ✗               | ✗            | ✗                          |
| **Viewer**    | ✓            | ✗               | ✗               | ✗            | ✗                          |
| **Commenter** | ✓            | ✓               | ✗               | ✗            | ✗                          |
| **Suggester** | ✓            | ✓               | ✓               | ✗            | ✗                          |
| **Editor**    | ✓            | ✓               | ✓               | ✓            | ✗                          |
| **Admin**     | ✓            | ✓               | ✓               | ✓            | ✓                          |

*Suggester role: can propose tracked changes that appear as suggestions. Cannot directly edit the document body. Ideal for external reviewers — client counsel, auditors, contractors.*

**7.3 Sharing Modes**

|                   |                                                                                                             |                                                     |
|-------------------|-------------------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| **Mode**          | **Who can access**                                                                                          | **Use case**                                        |
| **Private**       | Owner only. Not discoverable by anyone including workspace admins unless explicitly granted.                | Personal notes, unreleased drafts                   |
| **Space Members** | All members of the parent Space at their assigned role. Default for new documents.                          | Internal team documents, runbooks, RFCs             |
| **Invite Only**   | Named individuals with explicit role grant. Overrides Space membership in both directions.                  | Sensitive HR, board papers, client-shared documents |
| **Public Link**   | Anyone with link. No login required. Role fixed at Viewer or Commenter. Password optional. Expiry optional. | Published docs, auditor access, public API policy   |

**8. Deployment**

The self-hosted experience must be exactly: git clone, docker compose up. No Kubernetes expertise required. No cloud account required. A single machine with 4GB RAM should run a Chronicle instance for 50 users.

**8.1 Docker Compose Stack**

> services:
>
> api: \# Go binary — Chronicle API server
>
> sync: \# Node.js — Yjs Sync Gateway
>
> postgres: \# PostgreSQL 16 with persistent volume
>
> redis: \# Redis 7 — sessions, pub/sub, rate limiting
>
> meilisearch: \# Meilisearch — full-text search
>
> minio: \# MinIO — S3-compatible object store
>
> caddy: \# Reverse proxy — TLS termination, routing
>
> \# All data persists in named Docker volumes
>
> \# TLS via Caddy automatic HTTPS (Let's Encrypt)
>
> \# Single .env file for all configuration
>
> \# Upgrade: docker compose pull && docker compose up -d

|                                                                                                                                                                                                                                                                                                                     |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *Every Chronicle service runs as a non-root user. All sensitive configuration is via environment variables, never baked into images. The Compose file ships with secure defaults. The only required configuration for a working installation is DOMAIN, POSTGRES\_PASSWORD, and an email provider for magic links.* |

**8.2 Minimum Viable Server**

|                            |                            |              |                                                                                 |
|----------------------------|----------------------------|--------------|---------------------------------------------------------------------------------|
| **Profile**                | **Spec**                   | **Users**    | **Notes**                                                                       |
| **Development**            | 2 CPU, 4GB RAM, 20GB disk  | Local only   | docker compose up from repo. No external dependencies.                          |
| **Small team**             | 2 CPU, 4GB RAM, 50GB disk  | 5–50 users   | Single VPS (e.g. Hetzner CX21, \~€5/mo). Meilisearch and MinIO share the host.  |
| **Mid-size org**           | 4 CPU, 8GB RAM, 200GB disk | 50–500 users | Can split services across 2–3 machines. Postgres on dedicated host recommended. |
| **Enterprise self-hosted** | Kubernetes / Helm chart    | 500+ users   | Helm chart ships with Chronicle. Each service in its own deployment with HPA.   |

**8.3 Upgrade Strategy**

No breaking upgrades without a migration path. Every schema change ships with a forward migration and a rollback migration. Migrations are run automatically on startup by the Go API using golang-migrate. Downtime for standard upgrades is zero — all migrations are non-destructive (additive columns, new tables, index creations) unless explicitly flagged as breaking.

**9. Build Sequence**

Everything ships in v1.0. But not everything can be built simultaneously — some things are foundational. This is the dependency order, not a phased plan.

|                         |                                                                                                          |                                                      |
|-------------------------|----------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| **Milestone**           | **What gets built**                                                                                      | **Unblocks**                                         |
| **M1: Foundation**      | Postgres schema, go-git repo management, auth (email + Google), Docker Compose, CI                       | Everything. Nothing else can start without this.     |
| **M2: Core editor**     | TipTap + ProseMirror setup, node ID system, document CRUD, basic version history, Markdown serialisation | Real-time collab, diff rendering, deliberation layer |
| **M3: Real-time**       | Yjs Sync Gateway, y-prosemirror binding, WebSocket auth, Redis pub/sub, Y.Doc → Git flush pipeline       | Concurrent editing, presence, offline support        |
| **M4: Version control** | Branch creation, proposal workflow, go-git diff rendering, merge gate, named versions, conflict UI       | Review workflow, approvals                           |
| **M5: Deliberation**    | Threads, annotations, node anchor system, internal/external visibility, decision log, RLS policies       | Approval system, client portal                       |
| **M6: Approvals**       | Approval chains, hard merge gate, sign-off records, content hash, delegation, escalation                 | Enterprise governance                                |
| **M7: Permissions**     | RBAC, space/doc permissions, external guests, sharing modes, group permissions, SCIM                     | Enterprise sales, client portal                      |
| **M8: Search & polish** | Meilisearch integration, full-text search, templates, Confluence import, Slack/Teams notifications       | User adoption, migration from Confluence             |
| **M9: Enterprise**      | SAML SSO, legal hold, watermarking, domain-restricted sharing, audit log export, data residency config   | Enterprise deals                                     |
| **M10: Integrations**   | oEmbed, rich link cards (GitHub/Linear/Jira), webhook API, public REST API, Helm chart                   | Ecosystem, developer adoption                        |

|                                                                                                                                                                                                               |
|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| *M1–M4 must be sequential — each is a hard dependency for the next. M5–M10 can be parallelised across engineers once M4 is complete. A 3-engineer team can run M5, M6, and M7 simultaneously after M4 ships.* |

**10. Open Questions**

These decisions are not yet made. They should be resolved before or during M1. Deferring them beyond M1 risks rework.

-   **Email provider** — Email provider for magic links and notifications. Options: Resend (simplest API, generous free tier), Postmark (deliverability focus), self-hosted SMTP relay for air-gapped installs. The abstraction layer must support all three — don't hardcode Resend.

-   **ProseMirror schema** — ProseMirror schema definition. The node types and mark types must be defined and locked before any content is written. Schema changes after content exists are painful. Draft the full schema at M2 start and get sign-off before building extensions on top.

-   **Markdown dialect** — Markdown flavour. Chronicle must choose a Markdown dialect and own the round-trip serialiser (Markdown → ProseMirror → Markdown). CommonMark is the baseline. Chronicle extensions (annotation anchors, callout syntax, embed syntax) must be defined and documented. The serialiser is a Chronicle-owned library, not a third-party dep.

-   **JS runtime in Go** — Goja vs external process for JS in Go. The Yjs → ProseMirror JSON serialisation step requires running JavaScript inside the Go API. Goja (pure Go JS engine) avoids a subprocess but is slower than V8. An alternative is a small Node.js sidecar process. Decision has operational complexity implications.

-   **Confluence import scope** — Confluence import scope. The vision doc promises one-click Confluence import. The actual scope needs defining: page hierarchy only, or also attachments, comments history, and space permissions? Each adds weeks. Define the v1 scope before committing to the marketing claim.

**chronicle.dev**

Open source · Self-hostable · No per-user pricing
