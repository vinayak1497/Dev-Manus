import {
  Activity,
  CircleCheck,
  CircleDot,
  Search,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import {
  INCIDENT_SEVERITY_LABEL,
  INCIDENT_SEVERITY_SYMBOL,
  INCIDENT_STATUS_LABEL,
  type IncidentSeverity,
  type IncidentStatus,
} from "@/lib/incidents";

type Tone = Parameters<typeof Badge>[0]["tone"];

const SEVERITY_TONE: Record<IncidentSeverity, Tone> = {
  critical: "critical",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const STATUS_TONE: Record<IncidentStatus, Tone> = {
  open: "critical",
  investigating: "warning",
  identified: "info",
  monitoring: "info",
  resolved: "healthy",
};

const STATUS_ICON: Record<IncidentStatus, typeof CircleDot> = {
  open: CircleDot,
  investigating: Search,
  identified: Target,
  monitoring: Activity,
  resolved: CircleCheck,
};

/**
 * Incident severity badge. Icon + symbol + text so meaning survives without
 * colour (RULE.md §6.4).
 */
export function IncidentSeverityBadge({
  severity,
  className = "",
}: {
  severity: IncidentSeverity;
  className?: string;
}) {
  return (
    <Badge
      tone={SEVERITY_TONE[severity]}
      icon={<ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      className={className}
    >
      <span aria-hidden="true">{INCIDENT_SEVERITY_SYMBOL[severity]}</span>
      {INCIDENT_SEVERITY_LABEL[severity]}
    </Badge>
  );
}

/** Incident lifecycle status badge. */
export function IncidentStatusBadge({
  status,
  className = "",
}: {
  status: IncidentStatus;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge
      tone={STATUS_TONE[status]}
      icon={<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      className={className}
    >
      {INCIDENT_STATUS_LABEL[status]}
    </Badge>
  );
}
