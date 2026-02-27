import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "../api/client";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devBypassInfo, setDevBypassInfo] = useState<{
    token: string;
    message: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);
    setDevBypassInfo(null);

    try {
      const result = await requestPasswordReset(trimmedEmail);
      setStatus("submitted");
      
      // Dev bypass: show reset token in UI
      if (result.devResetToken) {
        setDevBypassInfo({
          token: result.devResetToken,
          message: "Development mode: Email service not configured. Use this token to reset your password:"
        });
      }
    } catch (error) {
      setStatus("idle");
      setErrorMessage(error instanceof Error ? error.message : "Request failed. Please try again.");
    }
  }

  return (
    <div className="auth-wrap">
      <Card>
        <h1>Reset Password</h1>
        <p className="muted">
          Enter your email address and we'll send you instructions to reset your password.
        </p>

        {errorMessage && (
          <div className="auth-error" role="alert">
            {errorMessage}
          </div>
        )}

        {status === "submitted" && !devBypassInfo && (
          <div className="auth-success-message">
            <p>
              If an account exists with that email, we've sent password reset instructions.
            </p>
            <p className="muted">
              Please check your email and follow the link to reset your password.
            </p>
          </div>
        )}

        {devBypassInfo && (
          <div className="dev-bypass-notice">
            <p>{devBypassInfo.message}</p>
            <code className="dev-token">{devBypassInfo.token}</code>
            <Link to={`/reset-password?token=${devBypassInfo.token}`} className="btn btn-primary">
              Reset Password Now
            </Link>
          </div>
        )}

        {status !== "submitted" && (
          <form onSubmit={handleSubmit} className="auth-form">
            <label htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={status === "submitting"}
            />

            <Button type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "Sending..." : "Send Reset Instructions"}
            </Button>
          </form>
        )}

        <div className="auth-links">
          <Link to="/sign-in" className="auth-link">
            Back to Sign In
          </Link>
        </div>

        {/* Dev bypass hint */}
        <div className="dev-hint">
          <p>
            <strong>Development mode:</strong> Since email service is not configured,
            the reset token will be displayed above after you submit (for existing accounts).
          </p>
        </div>
      </Card>
    </div>
  );
}
