import type { ReactNode } from "react";

type Tone =
  | "healthy"
  | "warning"
  | "critical"
  | "info"
  | "ai"
  | "neutral"
  | "unknown"
  | "maintenance";

const tones: Record<Tone, string> = {
  healthy: "bg-success-tint text-success border-success-border",
  warning: "bg-warning-tint text-warning border-warning-border",
  critical: "bg-critical-tint text-critical border-critical-border",
  info: "bg-info-tint text-info border-info-border",
  ai: "bg-ai-tint text-ai border-ai-border",
  neutral: "bg-subtle text-ink-secondary border-border-hairline",
  // "Unknown" is deliberately not green — unavailable data is never healthy
  // (RULE.md §9.2). Dashed border keeps it distinguishable without colour.
  unknown:
    "border-dashed border-border bg-subtle text-ink-secondary font-medium",
  maintenance: "bg-info-tint text-info border-info-border",
};

/**
 * Status is never color-alone: callers must pass icon + text.
 * (RULE.md §6.4 / Design.md §5)
 *
 * `tone="unknown"` is the honest default for projects with no telemetry
 * yet — it must never fall back to `healthy` (RULE.md §9.2).
 */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-[12px] font-medium leading-4 tracking-wide ${tones[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
