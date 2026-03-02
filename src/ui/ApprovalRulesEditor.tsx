import { useCallback, useRef, useState } from "react";
import type {
  ApprovalGroup,
  ApprovalGroupMember,
  ApprovalWorkflowMode,
  SaveApprovalRulesRequest,
} from "../api/types";

// ─── Workspace user picker type (minimal) ───────────────────────────────
type WorkspaceUser = {
  id: string;
  displayName: string;
  email: string;
};

// ─── Draft group for local editing ──────────────────────────────────────
type DraftGroup = {
  clientId: string;
  serverId?: string;
  name: string;
  description: string;
  minApprovals: number;
  members: ApprovalGroupMember[];
  collapsed: boolean;
};

let nextClientId = 1;
function makeClientId() {
  return `draft-${nextClientId++}`;
}

function clampMin(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// ─── Props ──────────────────────────────────────────────────────────────
type Props = {
  documentId: string;
  mode: ApprovalWorkflowMode;
  groups: ApprovalGroup[];
  workspaceUsers: WorkspaceUser[];
  saving?: boolean;
  onSave: (payload: SaveApprovalRulesRequest) => void;
  onCancel?: () => void;
};

export function ApprovalRulesEditor({
  mode: initialMode,
  groups: initialGroups,
  workspaceUsers,
  saving = false,
  onSave,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<ApprovalWorkflowMode>(initialMode);
  const [drafts, setDrafts] = useState<DraftGroup[]>(() =>
    initialGroups.map((g) => ({
      clientId: makeClientId(),
      serverId: g.id,
      name: g.name,
      description: g.description ?? "",
      minApprovals: g.minApprovals,
      members: g.members,
      collapsed: true,
    }))
  );
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [memberSearchOpen, setMemberSearchOpen] = useState<string | null>(null);
  const [memberQuery, setMemberQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Derived ──
  const dirty = isDirty();
  const totalGroups = drafts.length;

  function isDirty(): boolean {
    if (mode !== initialMode) return true;
    if (drafts.length !== initialGroups.length) return true;
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const g = initialGroups[i];
      if (
        d.serverId !== g.id ||
        d.name !== g.name ||
        d.minApprovals !== g.minApprovals ||
        d.members.length !== g.members.length
      )
        return true;
    }
    return false;
  }

  // ── Group CRUD ──
  function addGroup() {
    setDrafts((prev) => [
      ...prev,
      {
        clientId: makeClientId(),
        name: "",
        description: "",
        minApprovals: 1,
        members: [],
        collapsed: false,
      },
    ]);
  }

  function removeGroup(clientId: string) {
    setDrafts((prev) => prev.filter((d) => d.clientId !== clientId));
  }

  function updateGroup(clientId: string, patch: Partial<DraftGroup>) {
    setDrafts((prev) =>
      prev.map((d) => (d.clientId === clientId ? { ...d, ...patch } : d))
    );
  }

  function toggleCollapse(clientId: string) {
    updateGroup(clientId, {
      collapsed: !drafts.find((d) => d.clientId === clientId)?.collapsed,
    });
  }

  // ── Member management ──
  function addMember(clientId: string, user: WorkspaceUser) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.clientId !== clientId) return d;
        if (d.members.some((m) => m.userId === user.id)) return d;
        return {
          ...d,
          members: [
            ...d.members,
            {
              id: `temp-${user.id}`,
              userId: user.id,
              displayName: user.displayName,
              email: user.email,
            },
          ],
        };
      })
    );
    setMemberSearchOpen(null);
    setMemberQuery("");
  }

  function removeMember(clientId: string, userId: string) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.clientId !== clientId) return d;
        return { ...d, members: d.members.filter((m) => m.userId !== userId) };
      })
    );
  }

  // ── Drag reorder ──
  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, idx: number) => {
      e.preventDefault();
      if (dragIdx !== null && idx !== dragIdx) {
        setDropIdx(idx);
      }
    },
    [dragIdx]
  );

  const handleDrop = useCallback(() => {
    if (dragIdx !== null && dropIdx !== null && dragIdx !== dropIdx) {
      setDrafts((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(dropIdx, 0, moved);
        return next;
      });
    }
    setDragIdx(null);
    setDropIdx(null);
  }, [dragIdx, dropIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDropIdx(null);
  }, []);

  // ── Save ──
  function handleSave() {
    const payload: SaveApprovalRulesRequest = {
      mode,
      groups: drafts.map((d, i) => ({
        id: d.serverId,
        name: d.name || `Group ${i + 1}`,
        description: d.description || undefined,
        minApprovals: d.minApprovals,
        sortOrder: i,
        memberUserIds: d.members.map((m) => m.userId),
      })),
    };
    onSave(payload);
  }

  // ── Filtered users for search ──
  function getFilteredUsers(groupClientId: string) {
    const group = drafts.find((d) => d.clientId === groupClientId);
    const existingIds = new Set(group?.members.map((m) => m.userId) ?? []);
    const query = memberQuery.toLowerCase();
    return workspaceUsers.filter(
      (u) =>
        !existingIds.has(u.id) &&
        (u.displayName.toLowerCase().includes(query) ||
          u.email.toLowerCase().includes(query))
    );
  }

  function initials(name: string): string {
    return name
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <div className="cm-rules-editor">
      {/* ── Header ── */}
      <div className="cm-rules-header">
        <div className="cm-rules-header-text">
          <h3 className="cm-rules-title">Approval Workflow</h3>
          <p className="cm-rules-subtitle">
            Define who must approve before proposals can be merged.
          </p>
        </div>
      </div>

      {/* ── Mode toggle ── */}
      <div className="cm-rules-mode">
        <span className="cm-rules-mode-label">Execution order</span>
        <div className="cm-rules-mode-toggle">
          <button
            type="button"
            className={`cm-rules-mode-btn ${mode === "sequential" ? "active" : ""}`}
            onClick={() => setMode("sequential")}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M2 4h3l2 4-2 4H2l2-4L2 4ZM9 4h3l2 4-2 4H9l2-4L9 4Z"
                fill="currentColor"
              />
            </svg>
            Sequential
          </button>
          <button
            type="button"
            className={`cm-rules-mode-btn ${mode === "parallel" ? "active" : ""}`}
            onClick={() => setMode("parallel")}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
            </svg>
            Parallel
          </button>
        </div>
        <span className="cm-rules-mode-hint">
          {mode === "sequential"
            ? "Groups must be approved in order — each group unlocks the next."
            : "All groups can be approved at the same time."}
        </span>
      </div>

      {/* ── Pipeline visualization ── */}
      {totalGroups > 0 && (
        <div className="cm-rules-pipeline">
          {drafts.map((d, i) => (
            <div className="cm-rules-pipeline-step" key={d.clientId}>
              <div className="cm-rules-pipeline-node">
                <span className="cm-rules-pipeline-order">{i + 1}</span>
              </div>
              <span className="cm-rules-pipeline-name">
                {d.name || `Group ${i + 1}`}
              </span>
              <span className="cm-rules-pipeline-meta">
                {d.minApprovals} of {d.members.length || "?"}
              </span>
              {mode === "sequential" && i < totalGroups - 1 && (
                <div className="cm-rules-pipeline-connector" aria-hidden="true">
                  <svg viewBox="0 0 20 10" width="20" height="10">
                    <path d="M0 5h14M10 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                </div>
              )}
              {mode === "parallel" && i < totalGroups - 1 && (
                <div className="cm-rules-pipeline-connector parallel" aria-hidden="true">
                  <span className="cm-rules-pipeline-ampersand">&</span>
                </div>
              )}
            </div>
          ))}
          <div className="cm-rules-pipeline-step cm-rules-pipeline-merge">
            <div className="cm-rules-pipeline-node merge">
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d="M3 8h10M8 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="cm-rules-pipeline-name">Merge</span>
          </div>
        </div>
      )}

      {/* ── Group cards ── */}
      <div className="cm-rules-groups">
        {drafts.map((draft, idx) => (
          <div
            className={`cm-rules-group ${dragIdx === idx ? "dragging" : ""} ${dropIdx === idx ? "drop-target" : ""}`}
            key={draft.clientId}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          >
            {/* Group header row */}
            <div className="cm-rules-group-header">
              <div
                className="cm-rules-drag-handle"
                aria-label="Drag to reorder"
                title="Drag to reorder"
              >
                <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
                  <circle cx="3" cy="3" r="1.2" fill="currentColor" />
                  <circle cx="7" cy="3" r="1.2" fill="currentColor" />
                  <circle cx="3" cy="8" r="1.2" fill="currentColor" />
                  <circle cx="7" cy="8" r="1.2" fill="currentColor" />
                  <circle cx="3" cy="13" r="1.2" fill="currentColor" />
                  <circle cx="7" cy="13" r="1.2" fill="currentColor" />
                </svg>
              </div>

              <span className="cm-rules-group-ordinal">{idx + 1}</span>

              <input
                className="cm-rules-group-name-input"
                type="text"
                value={draft.name}
                placeholder="Group name (e.g. Legal Review)"
                onChange={(e) =>
                  updateGroup(draft.clientId, { name: e.target.value })
                }
              />

              <button
                type="button"
                className="cm-rules-group-toggle"
                onClick={() => toggleCollapse(draft.clientId)}
                aria-label={draft.collapsed ? "Expand group" : "Collapse group"}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  style={{
                    transform: draft.collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    transition: "transform 120ms ease",
                  }}
                >
                  <path
                    d="M4 6l4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <button
                type="button"
                className="cm-rules-group-remove"
                onClick={() => removeGroup(draft.clientId)}
                title="Remove group"
                aria-label="Remove group"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Expandable body */}
            {!draft.collapsed && (
              <div className="cm-rules-group-body">
                {/* Description */}
                <div className="cm-rules-field">
                  <label className="cm-rules-field-label">Description</label>
                  <input
                    className="cm-rules-field-input"
                    type="text"
                    value={draft.description}
                    placeholder="Optional — who this group is for"
                    onChange={(e) =>
                      updateGroup(draft.clientId, {
                        description: e.target.value,
                      })
                    }
                  />
                </div>

                {/* Min approvals */}
                <div className="cm-rules-field">
                  <label className="cm-rules-field-label">
                    Required approvals
                  </label>
                  <div className="cm-rules-min-approvals">
                    <button
                      type="button"
                      className="cm-rules-stepper-btn"
                      disabled={draft.minApprovals <= 1}
                      onClick={() =>
                        updateGroup(draft.clientId, {
                          minApprovals: clampMin(
                            draft.minApprovals - 1,
                            1,
                            Math.max(1, draft.members.length)
                          ),
                        })
                      }
                    >
                      &minus;
                    </button>
                    <span className="cm-rules-stepper-value">
                      {draft.minApprovals}
                    </span>
                    <button
                      type="button"
                      className="cm-rules-stepper-btn"
                      disabled={
                        draft.members.length > 0 &&
                        draft.minApprovals >= draft.members.length
                      }
                      onClick={() =>
                        updateGroup(draft.clientId, {
                          minApprovals: draft.minApprovals + 1,
                        })
                      }
                    >
                      +
                    </button>
                    <span className="cm-rules-stepper-hint">
                      of {draft.members.length || "0"} members
                    </span>
                  </div>
                </div>

                {/* Members */}
                <div className="cm-rules-field">
                  <label className="cm-rules-field-label">Members</label>
                  <div className="cm-rules-members">
                    {draft.members.map((m) => (
                      <div className="cm-rules-member" key={m.userId}>
                        <span className="cm-rules-member-avatar">
                          {initials(m.displayName)}
                        </span>
                        <span className="cm-rules-member-info">
                          <span className="cm-rules-member-name">
                            {m.displayName}
                          </span>
                          <span className="cm-rules-member-email">
                            {m.email}
                          </span>
                        </span>
                        <button
                          type="button"
                          className="cm-rules-member-remove"
                          onClick={() =>
                            removeMember(draft.clientId, m.userId)
                          }
                          aria-label={`Remove ${m.displayName}`}
                        >
                          <svg viewBox="0 0 14 14" width="12" height="12">
                            <path
                              d="M3 3l8 8M11 3l-8 8"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}

                    {/* Add member trigger */}
                    {memberSearchOpen === draft.clientId ? (
                      <div className="cm-rules-member-search">
                        <input
                          ref={searchRef}
                          className="cm-rules-member-search-input"
                          type="text"
                          value={memberQuery}
                          placeholder="Search by name or email…"
                          onChange={(e) => setMemberQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setMemberSearchOpen(null);
                              setMemberQuery("");
                            }
                          }}
                          autoFocus
                        />
                        <div className="cm-rules-member-results">
                          {getFilteredUsers(draft.clientId).map((u) => (
                            <button
                              key={u.id}
                              type="button"
                              className="cm-rules-member-result"
                              onClick={() => addMember(draft.clientId, u)}
                            >
                              <span className="cm-rules-member-avatar sm">
                                {initials(u.displayName)}
                              </span>
                              <span className="cm-rules-member-info">
                                <span className="cm-rules-member-name">
                                  {u.displayName}
                                </span>
                                <span className="cm-rules-member-email">
                                  {u.email}
                                </span>
                              </span>
                            </button>
                          ))}
                          {getFilteredUsers(draft.clientId).length === 0 && (
                            <div className="cm-rules-member-empty">
                              No matching workspace members
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="cm-rules-add-member-btn"
                        onClick={() => {
                          setMemberSearchOpen(draft.clientId);
                          setMemberQuery("");
                        }}
                      >
                        <svg viewBox="0 0 14 14" width="12" height="12">
                          <path
                            d="M7 2v10M2 7h10"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        Add member
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Collapsed summary */}
            {draft.collapsed && (
              <div className="cm-rules-group-summary">
                <span className="cm-rules-group-summary-members">
                  {draft.members.length}{" "}
                  {draft.members.length === 1 ? "member" : "members"}
                </span>
                <span className="cm-rules-group-summary-sep">·</span>
                <span className="cm-rules-group-summary-req">
                  {draft.minApprovals} required
                </span>
                {draft.members.length > 0 && (
                  <div className="cm-rules-group-summary-avatars">
                    {draft.members.slice(0, 4).map((m) => (
                      <span
                        key={m.userId}
                        className="cm-rules-member-avatar xs"
                        title={m.displayName}
                      >
                        {initials(m.displayName)}
                      </span>
                    ))}
                    {draft.members.length > 4 && (
                      <span className="cm-rules-member-avatar xs overflow">
                        +{draft.members.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add group button */}
        <button
          type="button"
          className="cm-rules-add-group"
          onClick={addGroup}
        >
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path
              d="M8 3v10M3 8h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          Add approval group
        </button>
      </div>

      {/* ── Footer ── */}
      <div className="cm-rules-footer">
        {onCancel && (
          <button
            type="button"
            className="cm-rules-cancel-btn"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="cm-rules-save-btn"
          onClick={handleSave}
          disabled={saving || (!dirty && initialGroups.length > 0)}
        >
          {saving ? "Saving…" : "Save rules"}
        </button>
      </div>
    </div>
  );
}
