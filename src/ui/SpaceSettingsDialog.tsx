import { useCallback, useEffect, useState } from "react";
import type {
  GuestUser,
  PermissionGrant,
  PermissionRole,
  Space,
  SpaceVisibility,
} from "../api/types";
import {
  fetchSpacePermissions,
  grantSpacePermission,
  revokeSpacePermission,
  inviteGuest,
  removeGuest,
  updateSpace,
  fetchAdminUsers,
  fetchGroups,
} from "../api/client";
import { Dialog } from "./Dialog";

interface SpaceSettingsDialogProps {
  space: Space;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (space: Space) => void;
}

type Tab = "details" | "permissions" | "guests";

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

type SearchResultItem =
  | { kind: "user"; id: string; displayName: string; email: string }
  | { kind: "group"; id: string; name: string; memberCount: number };

export function SpaceSettingsDialog({
  space,
  isOpen,
  onClose,
  onUpdated,
}: SpaceSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>("details");

  // Details tab state
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);
  const [visibility, setVisibility] = useState<SpaceVisibility>(space.visibility ?? "organization");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Permissions tab state
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [guests, setGuests] = useState<GuestUser[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(false);

  // Invite form state (permissions tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteRole, setInviteRole] = useState<PermissionRole>("editor");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guest invite state
  const [guestEmail, setGuestEmail] = useState("");
  const [guestRole, setGuestRole] = useState<PermissionRole>("viewer");
  const [isInvitingGuest, setIsInvitingGuest] = useState(false);

  // Reset form when space changes
  useEffect(() => {
    setName(space.name);
    setDescription(space.description);
    setVisibility(space.visibility ?? "organization");
    setSaved(false);
    setError(null);
  }, [space]);

  const loadPermData = useCallback(async () => {
    setLoadingPerms(true);
    try {
      const data = await fetchSpacePermissions(space.id);
      setPermissions(data.permissions ?? []);
      setGuests(data.guests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setLoadingPerms(false);
    }
  }, [space.id]);

  useEffect(() => {
    if (isOpen && (tab === "permissions" || tab === "guests")) {
      loadPermData();
    }
  }, [isOpen, tab, loadPermData]);

  async function handleSaveDetails() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateSpace(space.id, {
        name: name.trim(),
        description: description.trim(),
        visibility,
      });
      setSaved(true);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
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
        .map((u) => ({ kind: "user" as const, id: u.id, displayName: u.displayName, email: u.email }));

      const groups = await fetchGroups("ws_default");
      const groupResults: SearchResultItem[] = groups
        .filter((g) => g.name.toLowerCase().includes(query) && !existingIds.has(g.id))
        .slice(0, 5)
        .map((g) => ({ kind: "group" as const, id: g.id, name: g.name, memberCount: g.memberCount }));

      setSearchResults([...userResults, ...groupResults]);
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }

  async function handleGrantPermission(item: SearchResultItem) {
    setIsSubmitting(true);
    setError(null);
    try {
      await grantSpacePermission(space.id, {
        subjectType: item.kind === "user" ? "user" : "group",
        subjectId: item.kind === "user" ? item.id : item.id,
        role: inviteRole,
      });
      setSearchQuery("");
      setSearchResults([]);
      await loadPermData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add permission");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRevokePermission(permissionId: string) {
    try {
      await revokeSpacePermission(space.id, permissionId);
      await loadPermData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove permission");
    }
  }

  async function handleInviteGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!guestEmail.trim()) return;
    setIsInvitingGuest(true);
    setError(null);
    try {
      await inviteGuest(space.id, {
        email: guestEmail.trim(),
        role: guestRole,
      });
      setGuestEmail("");
      await loadPermData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite guest");
    } finally {
      setIsInvitingGuest(false);
    }
  }

  async function handleRemoveGuest(userId: string) {
    try {
      await removeGuest(space.id, userId);
      await loadPermData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove guest");
    }
  }

  const title = space.name.length > 28
    ? space.name.slice(0, 26) + "\u2026"
    : space.name;

  const detailsChanged =
    name.trim() !== space.name ||
    description.trim() !== space.description ||
    visibility !== (space.visibility ?? "organization");

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`${title} Settings`} size="large">
      <div className="sd">
        {/* Tab bar */}
        <div className="sd-tab-bar">
          {(["details", "permissions", "guests"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`sd-tab${tab === t ? " sd-tab-active" : ""}`}
              onClick={() => { setTab(t); setError(null); }}
              type="button"
            >
              {t === "details" ? "Details" : t === "permissions" ? "Permissions" : "Guests"}
            </button>
          ))}
        </div>

        {error && (
          <div className="sd-error">
            <Icon d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" size={16} />
            <span>{error}</span>
            <button className="sd-error-dismiss" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* Details Tab */}
        {tab === "details" && (
          <>
            <section className="sd-section">
              <label className="sd-section-label" htmlFor="ss-name">Space name</label>
              <input
                id="ss-name"
                type="text"
                className="sd-input"
                value={name}
                onChange={(e) => { setName(e.target.value); setSaved(false); }}
              />
              <label className="sd-section-label sd-label-gap" htmlFor="ss-desc">Description</label>
              <input
                id="ss-desc"
                type="text"
                className="sd-input"
                placeholder="Optional description"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
              />
            </section>

            <fieldset className="sd-modes">
              <legend className="sd-section-label">Visibility</legend>
              <div className="sd-mode-grid sd-mode-grid-2">
                {visibilityModes.map(({ mode, label, desc, icon }) => (
                  <label key={mode} className={`sd-mode-card${visibility === mode ? " sd-mode-active" : ""}`}>
                    <input
                      type="radio"
                      name="ss-visibility"
                      value={mode}
                      checked={visibility === mode}
                      onChange={() => { setVisibility(mode); setSaved(false); }}
                      className="sr-only"
                    />
                    <span className="sd-mode-icon"><Icon d={icon} size={20} /></span>
                    <span className="sd-mode-label">{label}</span>
                    <span className="sd-mode-desc">{desc}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="sd-actions">
              {saved && <span className="sd-saved-label">Saved</span>}
              <button
                className="sd-btn sd-btn-primary"
                onClick={() => void handleSaveDetails()}
                disabled={saving || !name.trim() || !detailsChanged}
                type="button"
              >
                {saving ? "Saving\u2026" : "Save changes"}
              </button>
            </div>
          </>
        )}

        {/* Permissions Tab */}
        {tab === "permissions" && (
          <section className="sd-section">
            <div className="sd-section-header">
              <span className="sd-section-label">People & groups with access</span>
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
                  disabled={isSubmitting}
                />
                {(searchResults.length > 0 || searching) && (
                  <div className="sd-search-results">
                    {searching && <div className="sd-empty">Searching\u2026</div>}
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        className="sd-search-result"
                        type="button"
                        onClick={() => void handleGrantPermission(item)}
                        disabled={isSubmitting}
                      >
                        <span className="sd-person-avatar">
                          {item.kind === "user" ? item.displayName[0]?.toUpperCase() ?? "?" : "G"}
                        </span>
                        <span className="sd-person-info">
                          <span className="sd-person-name">
                            {item.kind === "user" ? item.displayName : item.name}
                          </span>
                          <span className="sd-person-meta">
                            {item.kind === "user" ? item.email : `Group \u00b7 ${item.memberCount} members`}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <select
                className="sd-select"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as PermissionRole)}
                disabled={isSubmitting}
              >
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div className="sd-people-list">
              {loadingPerms ? (
                <div className="sd-empty">Loading\u2026</div>
              ) : permissions.length === 0 ? (
                <div className="sd-empty">No permissions configured</div>
              ) : (
                permissions.map((p) => (
                  <div key={p.id} className="sd-person">
                    <div className="sd-person-avatar">
                      {(p.userName || p.groupName || p.userEmail || "?")[0].toUpperCase()}
                    </div>
                    <div className="sd-person-info">
                      <span className="sd-person-name">
                        {p.userName || p.groupName || p.userEmail}
                      </span>
                      <span className="sd-person-meta">
                        {p.subjectType === "group" ? `Group \u00b7 ${p.memberCount ?? 0} members` : p.userEmail}
                      </span>
                    </div>
                    <span className="sd-role-badge">{roleLabels[p.role]}</span>
                    <button
                      onClick={() => handleRevokePermission(p.id)}
                      className="sd-btn-icon sd-btn-danger"
                      title="Remove access"
                    >
                      <Icon d="M6 18 18 6M6 6l12 12" size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Guests Tab */}
        {tab === "guests" && (
          <section className="sd-section">
            <div className="sd-section-header">
              <span className="sd-section-label">Guest users</span>
              <span className="sd-count">{guests.length}</span>
            </div>
            <form onSubmit={handleInviteGuest} className="sd-invite-form">
              <input
                type="email"
                className="sd-input sd-input-email"
                placeholder="guest@company.com"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                disabled={isInvitingGuest}
              />
              <select
                className="sd-select"
                value={guestRole}
                onChange={(e) => setGuestRole(e.target.value as PermissionRole)}
                disabled={isInvitingGuest}
              >
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
                <option value="editor">Editor</option>
              </select>
              <button type="submit" className="sd-btn sd-btn-primary" disabled={isInvitingGuest || !guestEmail.trim()}>
                {isInvitingGuest ? "Inviting\u2026" : "Invite"}
              </button>
            </form>

            <div className="sd-people-list">
              {loadingPerms ? (
                <div className="sd-empty">Loading\u2026</div>
              ) : guests.length === 0 ? (
                <div className="sd-empty">No guests invited yet</div>
              ) : (
                guests.map((g) => (
                  <div key={g.id} className="sd-person">
                    <div className="sd-person-avatar">
                      {(g.displayName || g.email || "?")[0].toUpperCase()}
                    </div>
                    <div className="sd-person-info">
                      <span className="sd-person-name">{g.displayName || g.email}</span>
                      <span className="sd-person-meta">
                        {g.email}
                        {g.expiresAt && ` \u00b7 Expires ${new Date(g.expiresAt).toLocaleDateString()}`}
                      </span>
                    </div>
                    <span className="sd-role-badge">{roleLabels[g.role]}</span>
                    <button
                      onClick={() => void handleRemoveGuest(g.id)}
                      className="sd-btn-icon sd-btn-danger"
                      title="Remove guest"
                    >
                      <Icon d="M6 18 18 6M6 6l12 12" size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}
