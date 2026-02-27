import { Link, useLocation } from "react-router-dom";
import { Card } from "../ui/Card";

export function VerificationPendingPage() {
  const location = useLocation();
  const email = location.state?.email as string | undefined;

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
