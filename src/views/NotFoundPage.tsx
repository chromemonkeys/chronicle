import { Link, useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <section className="auth-wrap">
      <div className="card" style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⊘</div>
        <h1>Page not found</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="button-row" style={{ justifyContent: "center" }}>
          <Button onClick={() => navigate(-1)} variant="ghost">
            ← Go back
          </Button>
          <Link to="/documents" className="btn btn-primary">
            Go to Documents
          </Link>
        </div>
      </div>
    </section>
  );
}
