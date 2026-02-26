import type { HTMLAttributes } from "react";

type Props = {
  variant: "accepted" | "rejected" | "deferred" | "pending" | "approved";
} & HTMLAttributes<HTMLSpanElement>;

export function StatusPill({ variant, className = "", ...props }: Props) {
  return <span className={`status-pill ${variant} ${className}`.trim()} {...props} />;
}
