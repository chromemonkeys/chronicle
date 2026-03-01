import { useCallback, useEffect, useState } from "react";
import type { PermissionGrant, PermissionRole, PublicLink, ShareMode } from "../api/types";
import {
  fetchDocumentShare,
  grantDocumentPermission,
  revokeDocumentPermission,
  createPublicLink,
  revokePublicLink,
} from "../api/client";
import { Dialog } from "./Dialog";

interface ShareDialogProps {
  documentId: string;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

const roleLabels: Record<PermissionRole, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  suggester: "Suggester",
  editor: "Editor",
  admin: "Admin",
};

const shareModeLabels: Record<ShareMode, string> = {
  private: "Private (only you)",
  space: "Space members",
  invite: "Invite only",
  link: "Anyone with the link",
};

export function ShareDialog({ documentId, documentTitle, isOpen, onClose }: ShareDialogProps) {
  const [shareMode, setShareMode] = useState<ShareMode>("space");
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [publicLinks, setPublicLinks] = useState<PublicLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PermissionRole>("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Public link form
  const [linkRole, setLinkRole] = useState<"viewer" | "commenter">("viewer");
  const [linkPassword, setLinkPassword] = useState("");
  const [linkExpiresAt, setLinkExpiresAt] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadShareData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchDocumentShare(documentId);
      setPermissions(data.permissions);
      setPublicLinks(data.publicLinks);
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

  const handleAddPerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      await grantDocumentPermission(documentId, {
        email,
        role,
        expiresAt: expiresAt || undefined,
      });
      setEmail("");
      setExpiresAt("");
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add person");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      await revokeDocumentPermission(documentId, userId);
      await loadShareData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove access");
    }
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createPublicLink(documentId, {
        role: linkRole,
        password: linkPassword || undefined,
        expiresAt: linkExpiresAt || undefined,
      });
      setLinkPassword("");
      setLinkExpiresAt("");
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

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Share "${documentTitle}"`} size="large">
      <div className="share-dialog">
        {error && <div className="error-message">{error}</div>}

        <section className="share-mode-section">
          <h4>Who can access</h4>
          <div className="share-modes">
            {(Object.keys(shareModeLabels) as ShareMode[]).map((mode) => (
              <label key={mode} className="radio-option">
                <input
                  type="radio"
                  name="shareMode"
                  value={mode}
                  checked={shareMode === mode}
                  onChange={() => setShareMode(mode)}
                />
                <span>{shareModeLabels[mode]}</span>
              </label>
            ))}
          </div>
        </section>

        {shareMode === "invite" && (
          <section className="invite-section">
            <h4>People with access</h4>
            <form onSubmit={handleAddPerson} className="add-form">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as PermissionRole)}
                disabled={isSubmitting}
              >
                {Object.entries(roleLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                placeholder="Expires (optional)"
                disabled={isSubmitting}
              />
              <button type="submit" disabled={isSubmitting || !email.trim()}>
                Add
              </button>
            </form>

            <div className="permissions-list">
              {isLoading ? (
                <div className="loading">Loading...</div>
              ) : permissions.length === 0 ? (
                <div className="empty">No one has been invited yet.</div>
              ) : (
                permissions.map((p) => (
                  <div key={p.id} className="permission-item">
                    <div className="permission-info">
                      <span className="name">{p.userName || p.userEmail}</span>
                      <span className="role">{roleLabels[p.role]}</span>
                      {p.expiresAt && (
                        <span className="expires">
                          Expires: {new Date(p.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <button onClick={() => handleRevoke(p.subjectId)} className="btn-remove">
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {shareMode === "link" && (
          <section className="public-links-section">
            <h4>Public links</h4>
            <form onSubmit={handleCreateLink} className="link-form">
              <select
                value={linkRole}
                onChange={(e) => setLinkRole(e.target.value as "viewer" | "commenter")}
                disabled={isSubmitting}
              >
                <option value="viewer">Viewer</option>
                <option value="commenter">Commenter</option>
              </select>
              <input
                type="password"
                placeholder="Password (optional)"
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <input
                type="datetime-local"
                value={linkExpiresAt}
                onChange={(e) => setLinkExpiresAt(e.target.value)}
                placeholder="Expires (optional)"
                disabled={isSubmitting}
              />
              <button type="submit" disabled={isSubmitting}>
                Create Link
              </button>
            </form>

            <div className="links-list">
              {isLoading ? (
                <div className="loading">Loading...</div>
              ) : publicLinks.length === 0 ? (
                <div className="empty">No public links created yet.</div>
              ) : (
                publicLinks.map((link) => (
                  <div key={link.id} className="link-item">
                    <div className="link-info">
                      <span className="role">{roleLabels[link.role as PermissionRole]}</span>
                      <span className="access-count">{link.accessCount} views</span>
                      {link.expiresAt && (
                        <span className="expires">
                          Expires: {new Date(link.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                      {link.lastAccessedAt && (
                        <span className="last-accessed">
                          Last viewed: {new Date(link.lastAccessedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="link-actions">
                      <button
                        onClick={() => copyLink(link.token)}
                        className="btn-copy"
                      >
                        {copiedToken === link.token ? "Copied!" : "Copy Link"}
                      </button>
                      <button onClick={() => handleRevokeLink(link.id)} className="btn-remove">
                        Revoke
                      </button>
                    </div>
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
