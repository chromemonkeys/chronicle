import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { resendVerification } from "../api/client";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function VerificationPendingPage() {
  const location = useLocation();
  const email = location.state?.email as string | undefined;

  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [devToken, setDevToken] = useState<string | null>(null);

  async function handleResend() {
    if (!email || resendState === "sending") return;

    setResendState("sending");
    setDevToken(null);

    try {
      const result = await resendVerification(email);
      setResendState("sent");
      if (result.devVerificationToken) {
        setDevToken(result.devVerificationToken);
      }
    } catch {
      setResendState("error");
    }
  }

  return (
    <div className="auth-wrap">
      <Card>
        <div className="auth-pending">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="pending-icon"
            style={{ width: 64, height: 64, marginBottom: 16 }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>

          <h1>Check Your Email</h1>

          <p>
            We've sent a verification link to{" "}
            <strong>{email || "your email address"}</strong>.
          </p>

          <p className="muted">
            Please check your email and click the verification link to complete your registration.
            If you don't see the email, check your spam folder.
          </p>

          {email && (
            <div style={{ marginTop: 16 }}>
              <Button
                variant="ghost"
                onClick={handleResend}
                disabled={resendState === "sending" || resendState === "sent"}
              >
                {resendState === "sending" && "Sending..."}
                {resendState === "sent" && "Verification email sent"}
                {resendState === "error" && "Retry sending verification email"}
                {resendState === "idle" && "Resend verification email"}
              </Button>
            </div>
          )}

          {devToken && (
            <div className="dev-bypass-notice" style={{ marginTop: 16 }}>
              <p>Development mode: Use this token to verify your email:</p>
              <code className="dev-token">{devToken}</code>
              <Link to={`/verify-email?token=${devToken}`} className="btn btn-primary">
                Verify Email Now
              </Link>
            </div>
          )}

          <div className="auth-links" style={{ marginTop: 24 }}>
            <Link to="/verify-email" className="btn btn-primary">
              I Have a Verification Token
            </Link>
            <Link to="/sign-in" className="auth-link">
              Back to Sign In
            </Link>
          </div>

          {/* Dev bypass hint */}
          <div className="dev-hint" style={{ marginTop: 32 }}>
            <p>
              <strong>Development mode:</strong> If email service is not configured,
              the verification token will be displayed after sign up instead of being sent via email.
              You can also{" "}
              <Link to="/sign-in">sign up again</Link> to see the token.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
