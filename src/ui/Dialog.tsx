import { useEffect, useRef } from "react";

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "small" | "medium" | "large";
}

export function Dialog({ isOpen, onClose, title, children, size = "medium" }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClass = {
    small: "dialog-small",
    medium: "dialog-medium",
    large: "dialog-large",
  }[size];

  return (
    <div ref={overlayRef} className="dialog-overlay">
      <div ref={dialogRef} className={`dialog ${sizeClass}`} role="dialog" aria-modal="true">
        <header className="dialog-header">
          <h3>{title}</h3>
          <button onClick={onClose} className="dialog-close" aria-label="Close">
            ×
          </button>
        </header>
        <div className="dialog-content">{children}</div>
      </div>
    </div>
  );
}
