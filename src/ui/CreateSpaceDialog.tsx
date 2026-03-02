import { useEffect, useRef, useState } from "react";
import { createSpace, fetchAdminUsers, fetchGroups, isApiError } from "../api/client";
import type {
  AdminUser,
  Group,
  InitialPermission,
  PermissionRole,
  SpaceVisibility,
  WorkspacesResponse,
} from "../api/types";
import { Dialog } from "./Dialog";

interface CreateSpaceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (data: WorkspacesResponse) => void;
}

type SearchResultItem =
  | { kind: "user"; user: AdminUser }
  | { kind: "group"; group: Group };

const visibilityModes: { mode: SpaceVisibility; label: string; desc: string; icon: string }[] = [
  {
    mode: "organization",
    label: "Organization",
    desc: "All workspace members can access",
    icon: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
  },
  {
    mode: "restricted",
    label: "Restricted",
    desc: "Only invited users and groups",
    icon: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
  },
];

const roleLabels: Record<PermissionRole, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  suggester: "Suggester",
  editor: "Editor",
  admin: "Admin",
};

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function CreateSpaceDialog({
  isOpen,
  onClose,
  onCreated,
}: CreateSpaceDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<SpaceVisibility>("organization");
  const [permissions, setPermissions] = useState<
    (InitialPermission & { displayName: string })[]
  >([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<PermissionRole>("editor");

  // Cached groups
  const [cachedGroups, setCachedGroups] = useState<Group[]>([]);
  const groupsFetched = useRef(false);

  useEffect(() => {
    if (isOpen && !groupsFetched.current) {
      groupsFetched.current = true;
      fetchGroups("ws_default").then(setCachedGroups).catch(() => {});
    }
    if (!isOpen) {
      groupsFetched.current = false;
    }
  }, [isOpen]);

  function reset() {
    setName("");
    setDescription("");
    setVisibility("organization");
    setPermissions([]);
    setError(null);
    setSearchQuery("");
    setSearchResults([]);
    setCachedGroups([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSearch(search: string) {
    setSearchQuery(search);
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const existingIds = new Set(permissions.map((p) => p.subjectId));
      const query = search.toLowerCase();

      const data = await fetchAdminUsers({ search, limit: 5 });
      const userResults: SearchResultItem[] = data.users
        .filter((u) => !existingIds.has(u.id))
        .map((user) => ({ kind: "user" as const, user }));

      const groupResults: SearchResultItem[] = cachedGroups
        .filter(
          (g) =>
            g.name.toLowerCase().includes(query) && !existingIds.has(g.id),
        )
        .slice(0, 5)
        .map((group) => ({ kind: "group" as const, group }));

      setSearchResults([...userResults, ...groupResults]);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  function addUserPermission(user: AdminUser) {
    setPermissions((prev) => [
      ...prev,
      {
        subjectType: "user" as const,
        subjectId: user.id,
        role: selectedRole,
        displayName: user.displayName || user.email,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  }

  function addGroupPermission(group: Group) {
    setPermissions((prev) => [
      ...prev,
      {
        subjectType: "group" as const,
        subjectId: group.id,
        role: selectedRole,
        displayName: group.name,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  }

  function removePermission(subjectId: string) {
    setPermissions((prev) => prev.filter((p) => p.subjectId !== subjectId));
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const data = await createSpace({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        initialPermissions: permissions.length > 0
          ? permissions.map(({ subjectType, subjectId, role }) => ({
              subjectType,
              subjectId,
              role,
            }))
          : undefined,
      });
      reset();
      onCreated(data);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to create space.");
    } finally {
      setCreating(false);
    }
  }

  const canCreate = name.trim().length > 0;

  return (
    <Dialog isOpen={isOpen} onClose={handleClose} title="Create Space" size="medium">
      <div className="sd">
        {error && (
          <div className="sd-error">
            <Icon d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" size={16} />
            <span>{error}</span>
            <button className="sd-error-dismiss" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* Name & Description */}
        <section className="sd-section">
          <label className="sd-section-label" htmlFor="cs-name">Space name</label>
          <input
            id="cs-name"
            type="text"
            className="sd-input"
            placeholder="e.g. Engineering, Legal, HR"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <label className="sd-section-label sd-label-gap" htmlFor="cs-desc">Description</label>
          <input
            id="cs-desc"
            type="text"
            className="sd-input"
            placeholder="What is this space for? (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </section>

        {/* Visibility picker */}
        <fieldset className="sd-modes">
          <legend className="sd-section-label">Visibility</legend>
          <div className="sd-mode-grid sd-mode-grid-2">
            {visibilityModes.map(({ mode, label, desc, icon }) => (
              <label key={mode} className={`sd-mode-card${visibility === mode ? " sd-mode-active" : ""}`}>
                <input
                  type="radio"
                  name="visibility"
                  value={mode}
                  checked={visibility === mode}
                  onChange={() => setVisibility(mode)}
                  className="sr-only"
                />
                <span className="sd-mode-icon"><Icon d={icon} size={20} /></span>
                <span className="sd-mode-label">{label}</span>
                <span className="sd-mode-desc">{desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Permissions (shown for restricted, optional for organization) */}
        {visibility === "restricted" && (
          <section className="sd-section">
            <div className="sd-section-header">
              <span className="sd-section-label">Initial permissions</span>
              <span className="sd-count">{permissions.length}</span>
            </div>
            <div className="sd-invite-form">
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="text"
                  className="sd-input"
                  placeholder="Search users or groups\u2026"
                  value={searchQuery}
                  onChange={(e) => void handleSearch(e.target.value)}
                />
                {(searchResults.length > 0 || searching) && (
                  <div className="sd-search-results">
                    {searching && <div className="sd-empty">Searching\u2026</div>}
                    {searchResults.map((item) =>
                      item.kind === "user" ? (
                        <button
                          key={item.user.id}
                          className="sd-search-result"
                          type="button"
                          onClick={() => addUserPermission(item.user)}
                        >
                          <span className="sd-person-avatar">
                            {(item.user.displayName || item.user.email || "?")[0].toUpperCase()}
                          </span>
                          <span className="sd-person-info">
                            <span className="sd-person-name">{item.user.displayName}</span>
                            <span className="sd-person-meta">{item.user.email}</span>
                          </span>
                        </button>
                      ) : (
                        <button
                          key={item.group.id}
                          className="sd-search-result"
                          type="button"
                          onClick={() => addGroupPermission(item.group)}
                        >
                          <span className="sd-person-avatar">G</span>
                          <span className="sd-person-info">
                            <span className="sd-person-name">{item.group.name}</span>
                            <span className="sd-person-meta">Group &middot; {item.group.memberCount} members</span>
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
              <select
                className="sd-select"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as PermissionRole)}
              >
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="sd-people-list">
              {permissions.length === 0 ? (
                <div className="sd-empty">Add at least one user or group</div>
              ) : (
                permissions.map((p) => (
                  <div key={p.subjectId} className="sd-person">
                    <div className="sd-person-avatar">
                      {p.displayName[0].toUpperCase()}
                    </div>
                    <div className="sd-person-info">
                      <span className="sd-person-name">{p.displayName}</span>
                      {p.subjectType === "group" && (
                        <span className="sd-person-meta">Group</span>
                      )}
                    </div>
                    <span className="sd-role-badge">{roleLabels[p.role]}</span>
                    <button
                      onClick={() => removePermission(p.subjectId)}
                      className="sd-btn-icon sd-btn-danger"
                      title="Remove"
                    >
                      <Icon d="M6 18 18 6M6 6l12 12" size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Actions */}
        <div className="sd-actions">
          <button className="sd-btn sd-btn-ghost" onClick={handleClose} type="button">
            Cancel
          </button>
          <button
            className="sd-btn sd-btn-primary"
            onClick={() => void handleCreate()}
            disabled={!canCreate || creating}
            type="button"
          >
            {creating ? "Creating\u2026" : "Create Space"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
