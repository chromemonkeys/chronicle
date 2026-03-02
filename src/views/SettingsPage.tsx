import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../state/AuthProvider";
import { UsersTab } from "./settings/UsersTab";
import { GroupsTab } from "./settings/GroupsTab";
import { RolesTab } from "./settings/RolesTab";

type SettingsTab = "users" | "groups" | "roles";

export function SettingsPage() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>("users");

  if (!isAdmin) {
    return <Navigate to="/documents" replace />;
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Organization Settings</h1>
        <p className="muted">Manage users, groups, and role permissions for your workspace.</p>
      </div>
      <div className="settings-tabs">
        <button
          className={`settings-tab${activeTab === "users" ? " active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          Users
        </button>
        <button
          className={`settings-tab${activeTab === "groups" ? " active" : ""}`}
          onClick={() => setActiveTab("groups")}
        >
          Groups
        </button>
        <button
          className={`settings-tab${activeTab === "roles" ? " active" : ""}`}
          onClick={() => setActiveTab("roles")}
        >
          Roles
        </button>
      </div>
      <div className="settings-content">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "groups" && <GroupsTab />}
        {activeTab === "roles" && <RolesTab />}
      </div>
    </div>
  );
}
