const ROLES = ["Viewer", "Commenter", "Suggester", "Editor", "Admin"] as const;

const CAPABILITIES = [
  { label: "Read documents", viewer: true, commenter: true, suggester: true, editor: true, admin: true },
  { label: "View history & blame", viewer: true, commenter: true, suggester: true, editor: true, admin: true },
  { label: "Add comments", viewer: false, commenter: true, suggester: true, editor: true, admin: true },
  { label: "Vote & react on threads", viewer: false, commenter: true, suggester: true, editor: true, admin: true },
  { label: "Suggest tracked changes", viewer: false, commenter: false, suggester: true, editor: true, admin: true },
  { label: "Create & edit documents", viewer: false, commenter: false, suggester: false, editor: true, admin: true },
  { label: "Create proposals", viewer: false, commenter: false, suggester: false, editor: true, admin: true },
  { label: "Resolve threads", viewer: false, commenter: false, suggester: false, editor: true, admin: true },
  { label: "Approve proposals", viewer: false, commenter: false, suggester: false, editor: true, admin: true },
  { label: "Merge proposals", viewer: false, commenter: false, suggester: false, editor: true, admin: true },
  { label: "Manage permissions", viewer: false, commenter: false, suggester: false, editor: false, admin: true },
  { label: "Manage spaces", viewer: false, commenter: false, suggester: false, editor: false, admin: true },
  { label: "Manage users & groups", viewer: false, commenter: false, suggester: false, editor: false, admin: true },
  { label: "Delete documents", viewer: false, commenter: false, suggester: false, editor: false, admin: true },
];

export function RolesTab() {
  return (
    <div className="settings-roles">
      <p className="muted">
        Role capabilities are hierarchical — each role includes all permissions from roles below it.
      </p>
      <table className="settings-table roles-matrix">
        <thead>
          <tr>
            <th>Capability</th>
            {ROLES.map((role) => (
              <th key={role} className="role-header">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAPABILITIES.map((cap) => (
            <tr key={cap.label}>
              <td>{cap.label}</td>
              <td className="role-cell">{cap.viewer ? "\u2713" : "\u2014"}</td>
              <td className="role-cell">{cap.commenter ? "\u2713" : "\u2014"}</td>
              <td className="role-cell">{cap.suggester ? "\u2713" : "\u2014"}</td>
              <td className="role-cell">{cap.editor ? "\u2713" : "\u2014"}</td>
              <td className="role-cell">{cap.admin ? "\u2713" : "\u2014"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
