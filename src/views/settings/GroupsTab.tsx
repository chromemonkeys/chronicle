import { useCallback, useEffect, useState } from "react";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  fetchAdminUsers,
  fetchGroups,
  fetchGroupMembers,
  fetchWorkspaces,
  isApiError,
  removeGroupMember,
} from "../../api/client";
import type { AdminUser, Group, GroupMember } from "../../api/types";
import { Button } from "../../ui/Button";

export function GroupsTab() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Create group form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  // Add member
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUser[]>([]);
  const [searching, setSearching] = useState(false);

  // We need the workspace ID for group APIs - fetch it from workspaces
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const loadGroups = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGroups(workspaceId);
      setGroups(data);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to load groups.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchWorkspaces()
      .then((data) => {
        setWorkspaceId(data.workspace.id);
      })
      .catch(() => {
        setError("Failed to load workspace.");
      });
  }, []);

  useEffect(() => {
    if (workspaceId) {
      void loadGroups();
    }
  }, [workspaceId, loadGroups]);

  async function handleExpandGroup(groupId: string) {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      setMembers([]);
      return;
    }
    setExpandedGroup(groupId);
    setMembersLoading(true);
    try {
      const data = await fetchGroupMembers(groupId);
      setMembers(data);
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to load members.");
    } finally {
      setMembersLoading(false);
    }
  }

  async function handleCreateGroup() {
    if (!workspaceId || !newName.trim()) return;
    setCreating(true);
    try {
      await createGroup(workspaceId, {
        name: newName.trim(),
        description: newDescription.trim(),
      });
      setNewName("");
      setNewDescription("");
      setShowCreateForm(false);
      await loadGroups();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to create group.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    try {
      await deleteGroup(groupId);
      if (expandedGroup === groupId) {
        setExpandedGroup(null);
        setMembers([]);
      }
      await loadGroups();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to delete group.");
    }
  }

  async function handleSearchMembers(search: string) {
    setMemberSearch(search);
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await fetchAdminUsers({ search, limit: 5 });
      setSearchResults(data.users);
    } catch {
      // ignore search errors
    } finally {
      setSearching(false);
    }
  }

  async function handleAddMember(groupId: string, userId: string) {
    try {
      await addGroupMember(groupId, userId);
      setMemberSearch("");
      setSearchResults([]);
      setAddMemberGroupId(null);
      // Reload members
      const data = await fetchGroupMembers(groupId);
      setMembers(data);
      await loadGroups();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to add member.");
    }
  }

  async function handleRemoveMember(groupId: string, userId: string) {
    try {
      await removeGroupMember(groupId, userId);
      const data = await fetchGroupMembers(groupId);
      setMembers(data);
      await loadGroups();
    } catch (err) {
      setError(isApiError(err) ? err.message : "Failed to remove member.");
    }
  }

  return (
    <div className="settings-groups">
      <div className="settings-toolbar">
        <Button
          variant={showCreateForm ? "ghost" : "primary"}
          className="btn-sm"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? "Cancel" : "Create Group"}
        </Button>
      </div>

      {error && <p className="settings-error">{error}</p>}

      {showCreateForm && (
        <form
          className="settings-create-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateGroup();
          }}
        >
          <input
            type="text"
            placeholder="Group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            disabled={creating}
            autoFocus
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            disabled={creating}
          />
          <Button type="submit" className="btn-sm" disabled={creating || !newName.trim()}>
            {creating ? "Creating..." : "Create"}
          </Button>
        </form>
      )}

      {loading ? (
        <div className="settings-loading">Loading groups...</div>
      ) : (
        <div className="settings-group-list">
          {groups.length === 0 && (
            <div className="settings-empty">No groups yet. Create one to get started.</div>
          )}
          {groups.map((group) => (
            <div key={group.id} className="settings-group-item">
              <div
                className="settings-group-row"
                onClick={() => void handleExpandGroup(group.id)}
              >
                <span className="settings-group-expand">
                  {expandedGroup === group.id ? "\u25BC" : "\u25B6"}
                </span>
                <div className="settings-group-info">
                  <strong>{group.name}</strong>
                  {group.description && (
                    <span className="muted"> — {group.description}</span>
                  )}
                </div>
                <span className="settings-group-count">
                  {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="ghost"
                  className="btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteGroup(group.id);
                  }}
                >
                  Delete
                </Button>
              </div>

              {expandedGroup === group.id && (
                <div className="settings-group-members">
                  {membersLoading ? (
                    <div className="settings-loading">Loading members...</div>
                  ) : (
                    <>
                      {members.length === 0 && (
                        <div className="settings-empty">No members in this group.</div>
                      )}
                      {members.map((member) => (
                        <div key={member.id} className="settings-member-row">
                          <span>{member.displayName}</span>
                          <span className="muted">{member.email}</span>
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            onClick={() =>
                              void handleRemoveMember(group.id, member.id)
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      {addMemberGroupId === group.id ? (
                        <div className="settings-add-member">
                          <input
                            type="text"
                            placeholder="Search users..."
                            value={memberSearch}
                            onChange={(e) =>
                              void handleSearchMembers(e.target.value)
                            }
                            autoFocus
                          />
                          {searching && <span className="muted">Searching...</span>}
                          {searchResults.map((user) => (
                            <div
                              key={user.id}
                              className="settings-search-result"
                              onClick={() =>
                                void handleAddMember(group.id, user.id)
                              }
                            >
                              {user.displayName} ({user.email})
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            onClick={() => {
                              setAddMemberGroupId(null);
                              setMemberSearch("");
                              setSearchResults([]);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          className="btn-sm"
                          onClick={() => setAddMemberGroupId(group.id)}
                        >
                          + Add member
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
