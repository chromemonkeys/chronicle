import { useCallback, useEffect, useState } from "react";
import type { GuestUser, PermissionGrant, PermissionRole, Space } from "../api/types";
import {
  fetchSpacePermissions,
  grantSpacePermission,
  revokeSpacePermission,
  inviteGuest,
  removeGuest,
} from "../api/client";
import { Dialog } from "./Dialog";
import { Tabs } from "./Tabs";

interface SpacePermissionsProps {
  space: Space;
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "users" | "groups" | "guests";

const roleLabels: Record<PermissionRole, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  suggester: "Suggester",
  editor: "Editor",
  admin: "Admin",
};

export function SpacePermissions({ space, isOpen, onClose }: SpacePermissionsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("users");
  const [permissions, setPermissions] = useState<PermissionGrant[]>([]);
  const [guests, setGuests] = useState<GuestUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add user/guest form state
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PermissionRole>("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPermissions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSpacePermissions(space.id);
      setPermissions(data.permissions);
      setGuests(data.guests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions");
    } finally {
      setIsLoading(false);
    }
  }, [space.id]);

  useEffect(() => {
    if (isOpen) {
      loadPermissions();
    }
  }, [isOpen, loadPermissions]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      await grantSpacePermission(space.id, {
        subjectType: "user",
        subjectId: email, // Will be resolved by backend
        role,
        expiresAt: expiresAt || undefined,
      });
      setEmail("");
      setExpiresAt("");
      await loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      await inviteGuest(space.id, {
        email,
        role,
        expiresAt: expiresAt || undefined,
      });
      setEmail("");
      setExpiresAt("");
      await loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite guest");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (permissionId: string) => {
    try {
      await revokeSpacePermission(space.id, permissionId);
      await loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke permission");
    }
  };

  const handleRemoveGuest = async (userId: string) => {
    try {
      await removeGuest(space.id, userId);
      await loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove guest");
    }
  };

  const userPermissions = permissions.filter((p) => p.subjectType === "user");
  const groupPermissions = permissions.filter((p) => p.subjectType === "group");

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title={`Space Settings: ${space.name}`} size="large">
      <div className="space-permissions">
        <Tabs
          tabs={[
            { id: "users", label: `Users (${userPermissions.length})` },
            { id: "groups", label: `Groups (${groupPermissions.length})` },
            { id: "guests", label: `Guests (${guests.length})` },
          ]}
          active={activeTab}
          onTabChange={(id) => setActiveTab(id as Tab)}
        />

        {error && <div className="error-message">{error}</div>}

        {activeTab === "users" && (
          <div className="tab-content">
            <form onSubmit={handleAddUser} className="add-form">
              <input
                type="email"
                placeholder="User email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <select value={role} onChange={(e) => setRole(e.target.value as PermissionRole)}>
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
              />
              <button type="submit" disabled={isSubmitting || !email.trim()}>
                Add User
              </button>
            </form>

            <div className="permissions-list">
              {isLoading ? (
                <div className="loading">Loading...</div>
              ) : userPermissions.length === 0 ? (
                <div className="empty">No users have been added to this space.</div>
              ) : (
                userPermissions.map((p) => (
                  <div key={p.id} className="permission-item">
                    <div className="permission-info">
                      <span className="name">{p.userName || p.userEmail}</span>
                      <span className="role">{roleLabels[p.role]}</span>
                      {p.expiresAt && (
                        <span className="expires">Expires: {new Date(p.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <button onClick={() => handleRevoke(p.id)} className="btn-remove">
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "groups" && (
          <div className="tab-content">
            <div className="info-message">
              Groups can be managed from the workspace settings.
            </div>
            <div className="permissions-list">
              {isLoading ? (
                <div className="loading">Loading...</div>
              ) : groupPermissions.length === 0 ? (
                <div className="empty">No groups have been added to this space.</div>
              ) : (
                groupPermissions.map((p) => (
                  <div key={p.id} className="permission-item">
                    <div className="permission-info">
                      <span className="name">{p.groupName}</span>
                      <span className="role">{roleLabels[p.role]}</span>
                      {p.memberCount && <span className="members">{p.memberCount} members</span>}
                    </div>
                    <button onClick={() => handleRevoke(p.id)} className="btn-remove">
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "guests" && (
          <div className="tab-content">
            <form onSubmit={handleInviteGuest} className="add-form">
              <input
                type="email"
                placeholder="Guest email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <select value={role} onChange={(e) => setRole(e.target.value as PermissionRole)}>
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
              />
              <button type="submit" disabled={isSubmitting || !email.trim()}>
                Invite Guest
              </button>
            </form>

            <div className="guests-list">
              {isLoading ? (
                <div className="loading">Loading...</div>
              ) : guests.length === 0 ? (
                <div className="empty">No guests have been invited to this space.</div>
              ) : (
                guests.map((g) => (
                  <div key={g.id} className="guest-item">
                    <div className="guest-info">
                      <span className="name">{g.displayName || g.email}</span>
                      <span className="badge-guest">GUEST</span>
                      <span className="role">{roleLabels[g.role]}</span>
                      {g.expiresAt && (
                        <span className="expires">Expires: {new Date(g.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <button onClick={() => handleRemoveGuest(g.id)} className="btn-remove">
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
