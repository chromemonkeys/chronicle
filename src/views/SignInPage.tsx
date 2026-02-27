import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthProvider";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type Tab = "signin" | "signup";

export function SignInPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isAuthLoading, signInWithPassword, signUp } = useAuth();
  
  const [activeTab, setActiveTab] = useState<Tab>("signin");
  
  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [devBypassInfo, setDevBypassInfo] = useState<{
    type: "verification" | "reset";
    token: string;
    message: string;
  } | null>(null);

  // Demo/legacy mode (display name only)
  const [demoName, setDemoName] = useState("");
  const [showDemoMode, setShowDemoMode] = useState(false);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    
    if (!trimmedEmail || !password) {
      setErrorMessage("Email and password are required.");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMessage(null);
    setDevBypassInfo(null);
    
    try {
      await signInWithPassword(trimmedEmail, password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = displayName.trim();
    
    if (!trimmedEmail || !password || !trimmedName) {
      setErrorMessage("All fields are required.");
      return;
    }
    
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMessage(null);
    setDevBypassInfo(null);
    
    try {
      const result = await signUp(trimmedEmail, password, trimmedName);
      
      // Dev bypass: show verification token in UI
      if (result.devVerificationToken) {
        setDevBypassInfo({
          type: "verification",
          token: result.devVerificationToken,
          message: "Development mode: Email service not configured. Use this token to verify your email:"
        });
      } else {
        // Redirect to verification pending page
        navigate("/verify-email-pending", { state: { email: trimmedEmail } });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign up failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDemoSignIn() {
    const trimmedName = demoName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage("Enter a display name (at least 2 characters).");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMessage(null);
    
    try {
      await signInWithPassword(trimmedName, "");
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

        {/* Tab Navigation */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${activeTab === "signin" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("signin");
              setErrorMessage(null);
              setDevBypassInfo(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab ${activeTab === "signup" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("signup");
              setErrorMessage(null);
              setDevBypassInfo(null);
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Error Message */}
        {errorMessage && (
          <div className="auth-error" role="alert">
            {errorMessage}
          </div>
        )}

        {/* Dev Bypass Info */}
        {devBypassInfo && (
          <div className="dev-bypass-notice">
            <p>{devBypassInfo.message}</p>
            <code className="dev-token">{devBypassInfo.token}</code>
            {devBypassInfo.type === "verification" && (
              <Link to={`/verify-email?token=${devBypassInfo.token}`} className="btn btn-primary">
                Verify Email Now
              </Link>
            )}
          </div>
        )}

        {/* Sign In Form */}
        {activeTab === "signin" && (
          <form onSubmit={handleSignIn} className="auth-form">
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isSubmitting}
            />

            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={isSubmitting}
            />

            <div className="auth-links">
              <Link to="/forgot-password" className="auth-link">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        )}

        {/* Sign Up Form */}
        {activeTab === "signup" && (
          <form onSubmit={handleSignUp} className="auth-form">
            <label htmlFor="signup-name">Display Name</label>
            <input
              id="signup-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              disabled={isSubmitting}
            />

            <label htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={isSubmitting}
            />

            <label htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={isSubmitting}
            />

            <label htmlFor="signup-confirm">Confirm Password</label>
            <input
              id="signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              autoComplete="new-password"
              disabled={isSubmitting}
            />

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        )}

        {/* Demo Mode Toggle */}
        <div className="auth-divider">
          <span>or</span>
        </div>

        {!showDemoMode ? (
          <Button
            variant="ghost"
            type="button"
            onClick={() => setShowDemoMode(true)}
          >
            Use demo mode (no email required)
          </Button>
        ) : (
          <div className="demo-mode">
            <label htmlFor="demo-name">Display Name (Demo Mode)</label>
            <input
              id="demo-name"
              type="text"
              value={demoName}
              onChange={(e) => setDemoName(e.target.value)}
              placeholder="Your name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleDemoSignIn();
                }
              }}
            />
            <div className="button-row">
              <Button onClick={handleDemoSignIn} disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setShowDemoMode(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
