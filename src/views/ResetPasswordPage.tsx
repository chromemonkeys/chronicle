import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { resetPassword } from "../api/client";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [token, setToken] = useState(tokenFromUrl || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Pre-fill token from URL
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!token.trim()) {
      setStatus("error");
      setMessage("Please enter a reset token.");
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      await resetPassword(token, newPassword);
      setStatus("success");
      setMessage("Your password has been reset successfully.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Password reset failed. The token may be invalid or expired.");
    }
  }

  if (status === "success") {
    return (
      <div className="auth-wrap">
        <Card>
          <div className="auth-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="success-icon">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <h1>Password Reset!</h1>
            <p>{message}</p>
            <Link to="/sign-in" className="btn btn-primary">
              Sign In with New Password
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <Card>
        <h1>Create New Password</h1>
        <p className="muted">
          Enter the reset token from your email and choose a new password.
        </p>

        {status === "error" && (
          <div className="auth-error" role="alert">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <label htmlFor="reset-token">Reset Token</label>
          <input
            id="reset-token"
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your reset token here"
            disabled={status === "submitting"}
            autoComplete="off"
          />

          <label htmlFor="new-password">New Password</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            disabled={status === "submitting"}
          />

          <label htmlFor="confirm-new-password">Confirm New Password</label>
          <input
            id="confirm-new-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your new password"
            autoComplete="new-password"
            disabled={status === "submitting"}
          />

          <Button type="submit" disabled={status === "submitting"}>
            {status === "submitting" ? "Resetting..." : "Reset Password"}
          </Button>
        </form>

        <div className="auth-links">
          <Link to="/sign-in" className="auth-link">
            Back to Sign In
          </Link>
          <Link to="/forgot-password" className="auth-link">
            Request New Token
          </Link>
        </div>
      </Card>
    </div>
  );
}
