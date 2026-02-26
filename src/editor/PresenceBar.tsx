/**
 * Connected users indicator.
 * Shows users from Yjs awareness (just current user with local provider).
 */
type PresenceUser = {
  name: string;
  color: string;
};

type Props = {
  users: PresenceUser[];
  className?: string;
};

export function PresenceBar({ users, className = "" }: Props) {
  if (users.length === 0) return null;

  return (
    <div className={`cm-presence-bar ${className}`.trim()}>
      <div className="cm-avatar-stack">
        {users.slice(0, 5).map((user, i) => (
          <div
            key={`${user.name}-${i}`}
            className="cm-avatar"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.slice(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
      <span className="cm-presence-count">
        {users.length} online
      </span>
    </div>
  );
}
