import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../state/AuthProvider";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function SignInPage() {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [magicLinkMessage, setMagicLinkMessage] = useState<string | null>(null);
  const { isAuthenticated, isAuthLoading, signIn } = useAuth();

  async function onSignIn() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Enter a display name to continue.");
      return;
    }
    if (trimmedName.length < 2) {
      setErrorMessage("Display name must be at least 2 characters.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setMagicLinkMessage(null);
    try {
      await signIn(trimmedName);
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
          onChange={(event) => {
            setName(event.target.value);
            if (errorMessage) {
              setErrorMessage(null);
            }
          }}
          placeholder="Your name"
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "sign-in-error" : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void onSignIn();
            }
          }}
        />
        {errorMessage ? <p id="sign-in-error" className="muted">{errorMessage}</p> : null}
        {magicLinkMessage ? <p className="muted">{magicLinkMessage}</p> : null}
        <div className="button-row">
          <Button onClick={onSignIn} disabled={isSubmitting || isAuthLoading}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setMagicLinkMessage("Magic-link sign-in is not enabled in this environment. Use display name sign-in.");
            }}
          >
            Use magic link
          </Button>
        </div>
      </Card>
    </div>
  );
}
