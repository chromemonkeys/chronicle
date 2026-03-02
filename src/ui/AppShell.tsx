import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthProvider";
import { Button } from "./Button";

export function AppShell() {
  const { isAuthenticated, isAuthLoading, userName, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const isWorkspaceRoute = location.pathname.startsWith("/workspace/");

  if (isAuthLoading) {
    return <main className="shell-main shell-loading">Loading session...</main>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />;
  }

  return (
    <div className="shell">
      {!isWorkspaceRoute && (
        <header className="shell-header">
          <Link to="/documents" className="brand">
            Chronicle<span className="brand-dot">.</span>
          </Link>
          <nav className="nav">
            <NavLink className="nav-link" to="/documents">
              Documents
            </NavLink>
            <NavLink className="nav-link" to="/approvals">
              Approvals
            </NavLink>
            {isAdmin && (
              <NavLink className="nav-link" to="/settings">
                Settings
              </NavLink>
            )}
          </nav>
          <div className="user-nav">
            <span className="chip">{userName}</span>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>
      )}
      <main className={`shell-main ${isWorkspaceRoute ? "shell-main-full" : ""}`.trim()}>
        <Outlet />
      </main>
    </div>
  );
}
