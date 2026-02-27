import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { verifyEmail } from "../api/client";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token");
  
  const [token, setToken] = useState(tokenFromUrl || "");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">(
    tokenFromUrl ? "verifying" : "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Auto-verify if token is in URL
    if (tokenFromUrl) {
      void doVerify(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  async function doVerify(verifyToken: string) {
    if (!verifyToken.trim()) {
      setStatus("error");
      setMessage("Please enter a verification token.");
      return;
    }

    setStatus("verifying");
    setMessage("");

    try {
      await verifyEmail(verifyToken);
      setStatus("success");
      setMessage("Your email has been verified! You can now sign in.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Verification failed. The token may be invalid or expired.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await doVerify(token);
  }

  if (status === "success") {
    return (
      <div className="auth-wrap">
        <Card>
          <div className="auth-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="success-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <h1>Email Verified!</h1>
            <p>{message}</p>
            <Link to="/sign-in" className="btn btn-primary">
              Sign In
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <Card>
        <h1>Verify Your Email</h1>
        <p className="muted">
          Enter the verification token from your email to complete registration.
        </p>

        {status === "error" && (
          <div className="auth-error" role="alert">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="verification-token">Verification Token</label>
          <input
            id="verification-token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your verification token here"
            disabled={status === "verifying"}
            autoComplete="off"
          />

          <Button type="submit" disabled={status === "verifying"}>
            {status === "verifying" ? "Verifying..." : "Verify Email"}
          </Button>
        </form>

        <div className="auth-links">
          <Link to="/sign-in" className="auth-link">
            Back to Sign In
          </Link>
        </div>

        {/* Dev bypass hint */}
        <div className="dev-hint">
          <p>
            <strong>Development mode:</strong> If you don't have a verification token,
            you can sign up again and the token will be displayed in the UI
            (since email service is not configured).
          </p>
        </div>
      </Card>
    </div>
  );
}
