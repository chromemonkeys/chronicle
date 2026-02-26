import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost";

type Props = {
  variant?: ButtonVariant;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "primary", className = "", ...props }: Props) {
  return (
    <button
      className={`btn btn-${variant} ${className}`.trim()}
      {...props}
    />
  );
}
