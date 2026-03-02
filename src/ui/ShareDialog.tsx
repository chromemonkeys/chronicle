import { useCallback, useEffect, useRef, useState } from "react";
import type { PermissionGrant, PermissionRole, PublicLink, ShareMode, ShareSearchUser, ShareSearchGroup } from "../api/types";
import type { GrantPermissionResult } from "../api/client";
import {
  fetchDocumentShare,
  updateDocumentShareMode,
  grantDocumentPermission,
  revokeDocumentPermission,
  searchDocumentShareCandidates,
  createPublicLink,
  revokePublicLink,
} from "../api/client";
import { Dialog } from "./Dialog";

interface ShareDialogProps {
  documentId: string;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  /** When set, a prominent action button is shown at the bottom of the dialog. */
  continueLabel?: string;
}

const roleLabels: Record<PermissionRole, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  suggester: "Suggester",
  editor: "Editor",
  admin: "Admin",
};

type GeneralAccessRole = "none" | PermissionRole;

const generalAccessLabels: Record<GeneralAccessRole, string> = {
  none: "No access",
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

type SearchResult =
  | { type: "user"; user: ShareSearchUser }
  | { type: "group"; group: ShareSearchGroup };

export function ShareDialog({ documentId, documentTitle, isOpen, onClose, continueLabel }: ShareDialogProps) {
  const [generalRole, setGeneralRole] = useState<GeneralAccessRole>("viewer");
  const [spaceName, setSpaceName] = useState<string>("");
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [publicLinks, setPublicLinks] = useState<PublicLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [addRole, setAddRole] = useState<PermissionRole>("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // Guest invite link (shown when invitee has no account)
  const [inviteLink, setInviteLink] = useState<{ url: string; email: string; copied?: boolean } | null>(null);

  // Public link form
  const [linkRole, setLinkRole] = useState<"viewer" | "commenter">("viewer");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linksExpanded, setLinksExpanded] = useState(false);

  const loadShareData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDocumentShare(documentId);
      setPermissions(data.permissions ?? []);
      setPublicLinks(data.publicLinks ?? []);
      setSpaceName(data.space?.name ?? "");
      // Derive general access state from shareMode
      const mode = data.shareMode ?? "space";
      if (mode === "private") {
        setGeneralRole("none");
      } else {
        setGeneralRole("viewer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load share settings");
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      loadShareData();
    }
  }, [isOpen, loadShareData]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const data = await searchDocumentShareCandidates(documentId, searchQuery.trim());
        const results: SearchResult[] = [
          ...data.users.map((u) => ({ type: "user" as const, user: u })),
          ...data.groups.map((g) => ({ type: "group" as const, group: g })),
        ];
        setSearchResults(results);
        setShowSearchDropdown(results.length > 0);
      } catch {
        // Silently fail search
      }
    }, 300);
  }, [searchQuery, documentId]);

  const handleGeneralAccessChange = async (role: GeneralAccessRole) => {
    setGeneralRole(role);
    const newMode: ShareMode = role === "none" ? "private" : "space";
    try {
      await updateDocumentShareMode(documentId, newMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update access");
    }
  };

  const handleSelectSearchResult = async (result: SearchResult) => {
    setShowSearchDropdown(false);
    setSearchQuery("");
    setIsSubmitting(true);
    setError(null);
    setInviteLink(null);
    try {
      if (result.type === "user") {
        await grantDocumentPermission(documentId, {
          email: result.user.email,
          role: addRole,
        });
      } else {
        await grantDocumentPermission(documentId, {
          subjectType: "group",
          subjectId: result.group.id,
          role: addRole,
        });
      }
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddByEmail = async () => {
    const email = searchQuery.trim();
    if (!email) return;
    setShowSearchDropdown(false);
    setSearchQuery("");
    setIsSubmitting(true);
    setError(null);
    setInviteLink(null);
    try {
      const result: GrantPermissionResult = await grantDocumentPermission(documentId, {
        email,
        role: addRole,
      });
      if (result.type === "invite_link") {
        const url = `${window.location.origin}/share/${result.token}`;
        setInviteLink({ url, email: result.email });
      }
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add person");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleAddByEmail();
    }
  };

  const handleInlineRoleChange = async (perm: PermissionGrant, newRole: PermissionRole) => {
    setError(null);
    try {
      if (perm.subjectType === "group") {
        await grantDocumentPermission(documentId, {
          subjectType: "group",
          subjectId: perm.subjectId,
          role: newRole,
        });
      } else {
        const email = perm.userEmail;
        if (email) {
          await grantDocumentPermission(documentId, { email, role: newRole });
        }
      }
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  const handleRevoke = async (permId: string) => {
    try {
      await revokeDocumentPermission(documentId, permId);
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove access");
    }
  };

  function durationToISO(duration: string): string | undefined {
    if (!duration) return undefined;
    const now = new Date();
    const units: Record<string, number> = { "1h": 3600e3, "1d": 86400e3, "7d": 7 * 86400e3, "30d": 30 * 86400e3, "90d": 90 * 86400e3 };
    const ms = units[duration];
    if (!ms) return undefined;
    return new Date(now.getTime() + ms).toISOString();
  }

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await createPublicLink(documentId, {
        role: linkRole,
        password: linkPassword || undefined,
        expiresAt: durationToISO(linkExpiresAt),
      });
      setLinkPassword("");
      setLinkExpiresAt("");
      setShowLinkForm(false);
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    try {
      await revokePublicLink(documentId, linkId);
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke link");
    }
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const title = documentTitle.length > 32
    ? documentTitle.slice(0, 30) + "\u2026"
    : documentTitle;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Share \u201c${title}\u201d`} size="medium">
      <div className="sd">
        {error && (
          <div className="sd-error">
            <Icon d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" size={16} />
            <span>{error}</span>
            <button className="sd-error-dismiss" onClick={() => setError(null)}>&times;</button>
          </div>
        )}

        {/* 1. General access */}
        <section className="sd-section">
          <span className="sd-section-label">General access</span>
          <div className="sd-general-access">
            <div className="sd-general-access-icon">
              <Icon d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" size={18} />
            </div>
            <div className="sd-general-access-label">
              {spaceName ? `Members of ${spaceName}` : "Space members"}
              <small>{generalRole === "none" ? "Restricted to invited people" : `Everyone in this space can ${generalRole === "viewer" ? "view" : generalRole === "commenter" ? "comment" : "edit"}`}</small>
            </div>
            <select
              className="sd-perm-role-select"
              value={generalRole}
              onChange={(e) => void handleGeneralAccessChange(e.target.value as GeneralAccessRole)}
            >
              {Object.entries(generalAccessLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </section>

        {/* 2. Add people or groups */}
        <section className="sd-section">
          <span className="sd-section-label">Add people or groups</span>
          <div className="sd-add-form">
            <div className="sd-search-wrapper" ref={searchWrapperRef}>
              <input
                type="text"
                className="sd-input sd-input-email"
                placeholder="Search by name, email, or group..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                disabled={isSubmitting}
              />
              {showSearchDropdown && searchResults.length > 0 && (
                <div className="sd-search-dropdown">
                  {searchResults.map((r) =>
                    r.type === "user" ? (
                      <div
                        key={`u-${r.user.id}`}
                        className="sd-search-item"
                        onClick={() => void handleSelectSearchResult(r)}
                      >
                        <div className="sd-person-avatar">
                          {(r.user.displayName || r.user.email || "?")[0].toUpperCase()}
                        </div>
                        <div className="sd-search-item-info">
                          <div className="sd-search-item-name">{r.user.displayName}</div>
                          <div className="sd-search-item-meta">{r.user.email}</div>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={`g-${r.group.id}`}
                        className="sd-search-item"
                        onClick={() => void handleSelectSearchResult(r)}
                      >
                        <div className="sd-group-icon">
                          <Icon d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" size={16} />
                        </div>
                        <div className="sd-search-item-info">
                          <div className="sd-search-item-name">{r.group.name}</div>
                          <div className="sd-search-item-meta">Group</div>
                        </div>
                        <span className="sd-member-count">{r.group.memberCount} member{r.group.memberCount !== 1 ? "s" : ""}</span>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
            <select
              className="sd-select"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as PermissionRole)}
              disabled={isSubmitting}
            >
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              className="sd-btn sd-btn-primary"
              disabled={isSubmitting || !searchQuery.trim()}
              onClick={() => void handleAddByEmail()}
            >
              {isSubmitting ? "Adding\u2026" : "Add"}
            </button>
          </div>

          {inviteLink && (
            <div className="sd-invite-link-banner">
              <div className="sd-invite-link-text">
                <strong>{inviteLink.email}</strong> doesn&rsquo;t have an account. Share this view-only link:
              </div>
              <div className="sd-invite-link-row">
                <input type="text" className="sd-input" readOnly value={inviteLink.url} onFocus={(e) => e.target.select()} />
                <button
                  className="sd-btn sd-btn-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(inviteLink.url);
                    setInviteLink((prev) => prev ? { ...prev, copied: true } : null);
                    setTimeout(() => setInviteLink((prev) => prev ? { ...prev, copied: false } : null), 2000);
                  }}
                >
                  {inviteLink.copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 3. Permissions list */}
        <section className="sd-section">
          <div className="sd-section-header">
            <span className="sd-section-label">People with access</span>
            <span className="sd-count">{permissions.length}</span>
          </div>
          <div className="sd-people-list">
            {isLoading ? (
              <div className="sd-empty">Loading...</div>
            ) : permissions.length === 0 ? (
              <div className="sd-empty">No one has been given specific access yet</div>
            ) : (
              permissions.map((p) => (
                <div key={p.id} className="sd-person">
                  {p.subjectType === "group" ? (
                    <div className="sd-group-icon">
                      <Icon d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" size={14} />
                    </div>
                  ) : (
                    <div className="sd-person-avatar">
                      {(p.userName || p.userEmail || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <div className="sd-person-info">
                    <span className="sd-person-name">
                      {p.subjectType === "group" ? p.groupName : (p.userName || p.userEmail)}
                    </span>
                    <span className="sd-person-meta">
                      {p.subjectType === "group"
                        ? `${p.memberCount ?? 0} member${(p.memberCount ?? 0) !== 1 ? "s" : ""}`
                        : p.userEmail}
                      {p.expiresAt && ` \u00b7 Expires ${new Date(p.expiresAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  <select
                    className="sd-perm-role-select"
                    value={p.role}
                    onChange={(e) => void handleInlineRoleChange(p, e.target.value as PermissionRole)}
                  >
                    {Object.entries(roleLabels).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button onClick={() => void handleRevoke(p.id)} className="sd-btn-icon sd-btn-danger" title="Remove access">
                    <Icon d="M6 18 18 6M6 6l12 12" size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 4. Public links (collapsible) */}
        <section className="sd-section">
          <button
            type="button"
            className="sd-collapsible-header"
            onClick={() => setLinksExpanded(!linksExpanded)}
          >
            <svg className={`sd-chevron${linksExpanded ? " sd-chevron-open" : ""}`} width={12} height={12} viewBox="0 0 12 12" fill="currentColor">
              <path d="M4.5 2l4 4-4 4" />
            </svg>
            Public links
            {publicLinks.length > 0 && <span className="sd-count">{publicLinks.length}</span>}
          </button>

          {linksExpanded && (
            <>
              <div className="sd-section-header">
                {!showLinkForm && (
                  <button className="sd-btn sd-btn-ghost" onClick={() => setShowLinkForm(true)}>
                    <Icon d="M12 4.5v15m7.5-7.5h-15" size={14} />
                    New link
                  </button>
                )}
              </div>

              {showLinkForm && (
                <form onSubmit={(e) => void handleCreateLink(e)} className="sd-link-form">
                  <div className="sd-link-form-row">
                    <div className="sd-field">
                      <label className="sd-field-label">Access level</label>
                      <select className="sd-select" value={linkRole} onChange={(e) => setLinkRole(e.target.value as "viewer" | "commenter")} disabled={isSubmitting}>
                        <option value="viewer">View only</option>
                        <option value="commenter">Can comment</option>
                      </select>
                    </div>
                    <div className="sd-field">
                      <label className="sd-field-label">Password</label>
                      <input type="password" className="sd-input" placeholder="Optional" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} disabled={isSubmitting} />
                    </div>
                    <div className="sd-field">
                      <label className="sd-field-label">Expires</label>
                      <select className="sd-select" value={linkExpiresAt} onChange={(e) => setLinkExpiresAt(e.target.value)} disabled={isSubmitting}>
                        <option value="">Never</option>
                        <option value="1h">1 hour</option>
                        <option value="1d">1 day</option>
                        <option value="7d">7 days</option>
                        <option value="30d">30 days</option>
                        <option value="90d">90 days</option>
                      </select>
                    </div>
                  </div>
                  <div className="sd-link-form-actions">
                    <button type="button" className="sd-btn sd-btn-ghost" onClick={() => setShowLinkForm(false)}>Cancel</button>
                    <button type="submit" className="sd-btn sd-btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? "Creating\u2026" : "Create link"}
                    </button>
                  </div>
                </form>
              )}

              <div className="sd-links-list">
                {isLoading ? (
                  <div className="sd-empty">Loading...</div>
                ) : publicLinks.length === 0 ? (
                  <div className="sd-empty">No public links yet</div>
                ) : (
                  publicLinks.map((link) => (
                    <div key={link.id} className="sd-link-row">
                      <div className="sd-link-icon">
                        <Icon d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" size={16} />
                      </div>
                      <div className="sd-link-info">
                        <div className="sd-link-meta">
                          <span className="sd-role-badge">{link.role === "viewer" ? "View only" : "Can comment"}</span>
                          <span className="sd-link-stat">{link.accessCount} view{link.accessCount !== 1 ? "s" : ""}</span>
                          {link.expiresAt && (
                            <span className="sd-link-stat">Expires {new Date(link.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="sd-link-actions">
                        <button onClick={() => copyLink(link.token)} className="sd-btn sd-btn-ghost sd-btn-sm">
                          {copiedToken === link.token ? (
                            <><Icon d="M4.5 12.75l6 6 9-13.5" size={14} /> Copied</>
                          ) : (
                            <><Icon d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" size={14} /> Copy</>
                          )}
                        </button>
                        <button onClick={() => void handleRevokeLink(link.id)} className="sd-btn-icon sd-btn-danger" title="Revoke link">
                          <Icon d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        {/* 5. Footer */}
        {continueLabel && (
          <div className="sd-footer">
            <button className="sd-btn sd-btn-primary sd-btn-continue" onClick={onClose}>
              {continueLabel}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
