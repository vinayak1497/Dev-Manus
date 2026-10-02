import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-md border border-border-hairline bg-surface shadow-card ${className}`}
    >
      {children}
    </div>
  );
}
