import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminCreateUser,
  fetchAdminUsers,
  isApiError,
  setUserStatus,
  updateUserRole,
} from "../../api/client";
import type { AdminUser } from "../../api/types";
import { Button } from "../../ui/Button";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Create user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newRole, setNewRole] = useState("editor");
  const [creating, setCreating] = useState(false);

  const loadUsers = useCallback(
    async (searchTerm: string, pageNum: number) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminUsers({
          search: searchTerm || undefined,
          limit: PAGE_SIZE,
          offset: pageNum * PAGE_SIZE,
        });
        setUsers(data.users);
        setTotal(data.total);
      } catch (err) {
        setError(isApiError(err) ? err.message : "Failed to load users.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadUsers(search, page);
  }, [page, loadUsers]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      void loadUsers(value, 0);
    }, DEBOUNCE_MS);
  }

  async function handleRoleChange(userId: string, role: string) {
    try {
      await updateUserRole(userId, role);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role } : u))
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to update role.");
    }
  }

  async function handleToggleStatus(user: AdminUser) {
    const activate = user.deactivatedAt !== null;
    try {
      await setUserStatus(user.id, activate);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, deactivatedAt: activate ? null : new Date().toISOString() }
            : u
        )
      );
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to update status.");
    }
  }

  async function handleCreateUser() {
    if (!newDisplayName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await adminCreateUser({
        displayName: newDisplayName.trim(),
        role: newRole,
      });
      setNewDisplayName("");
      setNewRole("editor");
      setShowCreateForm(false);
      void loadUsers(search, page);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="settings-users">
      <div className="settings-toolbar">
        <input
          type="text"
          className="settings-search"
          placeholder="Search users by name or email..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <span className="settings-count">{total} users</span>
        <Button
          variant={showCreateForm ? "ghost" : "primary"}
          className="btn-sm"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "Add User"}
        </Button>
      </div>

      {showCreateForm && (
        <form
          className="settings-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateUser();
          }}
        >
          <input
            type="text"
            placeholder="Display name"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            disabled={creating}
            autoFocus
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            disabled={creating}
          >
            <option value="viewer">Viewer</option>
            <option value="commenter">Commenter</option>
            <option value="suggester">Suggester</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" className="btn-sm" disabled={creating || !newDisplayName.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </form>
      )}

      {error && <p className="settings-error">{error}</p>}
      {loading ? (
        <div className="settings-loading">Loading users...</div>
      ) : (
        <>
          <table className="settings-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className={user.deactivatedAt ? "deactivated" : ""}
                >
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) =>
                        void handleRoleChange(user.id, e.target.value)
                      }
                    >
                      <option value="viewer">Viewer</option>
                      <option value="commenter">Commenter</option>
                      <option value="suggester">Suggester</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${user.deactivatedAt ? "inactive" : "active"}`}
                    >
                      {user.deactivatedAt ? "Inactive" : "Active"}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      className="btn-sm"
                      onClick={() => void handleToggleStatus(user)}
                    >
                      {user.deactivatedAt ? "Reactivate" : "Deactivate"}
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="settings-empty">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="settings-pagination">
              <Button
                variant="ghost"
                className="btn-sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="settings-page-info">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="ghost"
                className="btn-sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
