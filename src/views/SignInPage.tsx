import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../state/AuthProvider";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function SignInPage() {
  const [name, setName] = useState("Avery");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { isAuthenticated, isAuthLoading, signIn } = useAuth();

  async function onSignIn() {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await signIn(name);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isAuthLoading && isAuthenticated) {
    return <Navigate to="/documents" replace />;
  }

  return (
    <div className="auth-wrap">
      <Card>
        <h1>Welcome to Chronicle</h1>
        <p className="muted">
          Web-first collaborative documentation with persistent deliberation.
        </p>
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Your name"
        />
        {errorMessage ? <p className="muted">{errorMessage}</p> : null}
        <div className="button-row">
          <Button onClick={onSignIn} disabled={isSubmitting || isAuthLoading}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
          <Button variant="ghost" type="button" disabled title="Magic link sign-in is not wired yet.">
            Magic link (soon)
          </Button>
        </div>
      </Card>
    </div>
  );
}
