import { Link, useNavigate } from "react-router-dom";
import { Button } from "./Button";

export type EmptyStateVariant = "empty" | "error" | "loading";

interface EmptyStateProps {
  variant: EmptyStateVariant;
  title: string;
  description?: string;
  /** Primary action - typically the main CTA for this state */
  primaryAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Secondary action - typically "Go back" or navigation */
  secondaryAction?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
  /** Whether to show the home navigation fallback (Documents page) */
  showHomeFallback?: boolean;
  className?: string;
}

export function EmptyState({
  variant,
  title,
  description,
  primaryAction,
  secondaryAction,
  showHomeFallback = false,
  className = "",
}: EmptyStateProps) {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1);
  };

  if (variant === "loading") {
    return (
      <div className={`empty-state empty-state-loading ${className}`.trim()}>
        <div className="empty-state-content">
          <div className="empty-state-skeleton">
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`empty-state empty-state-${variant} ${className}`.trim()}>
      <div className="empty-state-content">
        <div className="empty-state-icon">
          {variant === "error" ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M16 16L32 32M32 16L16 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" opacity="0.3" />
              <path d="M24 14V28M24 32V34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        
        <h2 className="empty-state-title">{title}</h2>
        
        {description && (
          <p className="empty-state-description">{description}</p>
        )}
        
        <div className="empty-state-actions">
          {primaryAction && (
            <Button 
              onClick={primaryAction.onClick} 
              disabled={primaryAction.disabled}
              variant="primary"
            >
              {primaryAction.label}
            </Button>
          )}
          
          {secondaryAction && (
            secondaryAction.to ? (
              <Link to={secondaryAction.to} className="btn btn-secondary">
                {secondaryAction.label}
              </Link>
            ) : (
              <Button onClick={secondaryAction.onClick || handleGoBack} variant="ghost">
                {secondaryAction.label}
              </Button>
            )
          )}
          
          {/* Always show navigation fallback for error states */}
          {variant === "error" && !secondaryAction && (
            <>
              <Button onClick={handleGoBack} variant="ghost">
                ← Go back
              </Button>
              {showHomeFallback && (
                <Link to="/documents" className="btn btn-secondary">
                  Go to Documents
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Pre-configured empty state for common scenarios */
export function EmptyStateError({
  title = "Something went wrong",
  description = "We couldn't load the requested content. You can try again or navigate back.",
  onRetry,
  showHomeFallback = true,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  showHomeFallback?: boolean;
}) {
  return (
    <EmptyState
      variant="error"
      title={title}
      description={description}
      primaryAction={onRetry ? { label: "Try again", onClick: onRetry } : undefined}
      showHomeFallback={showHomeFallback}
    />
  );
}

export function EmptyStateEmpty({
  title = "Nothing here yet",
  description = "Get started by creating your first item.",
  actionLabel = "Create",
  onAction,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyState
      variant="empty"
      title={title}
      description={description}
      primaryAction={onAction ? { label: actionLabel, onClick: onAction } : undefined}
    />
  );
}
