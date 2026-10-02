import { Check, HelpCircle, Minus, Settings2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { DependencyStatus, Provenance } from "@/lib/onboarding/types";
import { dependencyStatusLabel } from "@/lib/onboarding/status-labels";
import { cn } from "@/lib/utils";

const MAP: Record<Provenance, { tone: "healthy" | "info" | "neutral" | "unknown"; label: string }> = {
  detected: { tone: "healthy", label: "Auto-detected" },
  configured: { tone: "info", label: "Custom" },
  not_detected: { tone: "unknown", label: "Not detected" },
  unknown: { tone: "neutral", label: "Unknown" },
  unavailable: { tone: "neutral", label: "Unavailable" },
};

function Icon({ p }: { p: Provenance }) {
  const cls = "h-3 w-3";
  if (p === "detected") return <Check className={cls} aria-hidden="true" />;
  if (p === "configured") return <Settings2 className={cls} aria-hidden="true" />;
  if (p === "unavailable") return <TriangleAlert className={cls} aria-hidden="true" />;
  if (p === "unknown") return <HelpCircle className={cls} aria-hidden="true" />;
  return <Minus className={cls} aria-hidden="true" />;
}

/**
 * Provenance badge — the wizard must NEVER conflate detected, configured,
 * not-detected, and unavailable (Design.md §43). Icon + text, never colour
 * alone (RULE.md §6.4).
 */
export function ProvenanceBadge({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  const m = MAP[provenance];
  return (
    <Badge tone={m.tone} icon={<Icon p={provenance} />} className={cn(className)}>
      {m.label}
    </Badge>
  );
}

const DEP_MAP: Record<DependencyStatus, { tone: "healthy" | "info" | "neutral" | "unknown"; label: string }> = {
  detected: { tone: "healthy", label: `✓ ${dependencyStatusLabel("detected")}` },
  configured: { tone: "info", label: `● ${dependencyStatusLabel("configured")}` },
  not_detected: { tone: "unknown", label: `○ ${dependencyStatusLabel("not_detected")}` },
  unknown: { tone: "neutral", label: `? ${dependencyStatusLabel("unknown")}` },
};

export function DependencyBadge({ status }: { status: DependencyStatus }) {
  const m = DEP_MAP[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
