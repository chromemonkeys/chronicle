import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="auth-wrap">
      <div className="card">
        <h1>Page not found</h1>
        <Link className="link" to="/documents">
          Return to documents
        </Link>
      </div>
    </section>
  );
}
