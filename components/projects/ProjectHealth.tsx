import {
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  Clock,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  HEALTH_LABEL,
  HEALTH_SYMBOL,
  type ProjectHealth,
} from "@/lib/projects";

const HEALTH_ICON: Record<ProjectHealth, typeof CircleCheck> = {
  healthy: CircleCheck,
  warning: TriangleAlert,
  critical: CircleAlert,
  unknown: CircleQuestionMark,
  maintenance: Clock,
  recovering: Clock,
};

type Tone = Parameters<typeof Badge>[0]["tone"];

const HEALTH_TONE: Record<ProjectHealth, Tone> = {
  healthy: "healthy",
  warning: "warning",
  critical: "critical",
  unknown: "unknown",
  maintenance: "maintenance",
  recovering: "info",
};

/** Solid dot used next to project titles — colour + meaning, never alone. */
const HEALTH_DOT_CLASS: Record<ProjectHealth, string> = {
  healthy: "bg-success",
  warning: "bg-warning",
  critical: "bg-critical",
  unknown: "bg-ink-muted",
  maintenance: "bg-info",
  recovering: "bg-info",
};

function resolveHealth(health: ProjectHealth | null): ProjectHealth {
  return health ?? "unknown";
}

/**
 * Health badge. Always icon + symbol + text so state survives without
 * colour (RULE.md §6.4 / Design.md §5). `null` health renders as Unknown —
 * never as Healthy (RULE.md §9.2).
 */
export function ProjectHealthBadge({
  health,
  className = "",
}: {
  health: ProjectHealth | null;
  className?: string;
}) {
  const state = resolveHealth(health);
  const Icon = HEALTH_ICON[state];
  return (
    <Badge
      tone={HEALTH_TONE[state]}
      icon={<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      className={className}
    >
      <span aria-hidden="true">{HEALTH_SYMBOL[state]}</span>
      {HEALTH_LABEL[state]}
    </Badge>
  );
}

export function ProjectHealthDot({
  health,
  className = "",
}: {
  health: ProjectHealth | null;
  className?: string;
}) {
  const state = resolveHealth(health);
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT_CLASS[state]} ${className}`}
    />
  );
}
