"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  CircleDot,
  Play,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Badge } from "@/components/ui/Badge";
import {
  REMEDIATION_STATUS_LABEL,
  RISK_LABEL,
  type RemediationAction,
  type RemediationRisk,
  type RemediationStatus,
} from "@/lib/incidents";
import {
  approveRemediation,
  executeRemediation,
  rejectRemediation,
} from "@/app/projects/[id]/incidents/actions";
import type { ActionResult } from "@/app/projects/[id]/incidents/actions";

type Tone = Parameters<typeof Badge>[0]["tone"];

const STATUS_TONE: Record<RemediationStatus, Tone> = {
  proposed: "info",
  approved: "warning",
  rejected: "neutral",
  applied: "info",
  verified: "healthy",
  failed: "critical",
};

const STATUS_ICON: Record<RemediationStatus, typeof CheckCircle2> = {
  proposed: CircleDot,
  approved: ShieldCheck,
  rejected: ShieldX,
  applied: Activity,
  verified: CheckCircle2,
  failed: TriangleAlert,
};

const RISK_TONE: Record<RemediationRisk, Tone> = {
  low: "neutral",
  medium: "warning",
  high: "critical",
};

/**
 * Human-approval + execution controls for one AI-proposed remediation (§14-16).
 *
 * The AI only ever *proposes*. Nothing is applied until a human approves, and
 * execution of a non-low-risk action requires an explicit acknowledgement —
 * "higher-risk needs stronger confirmation". Execution does NOT mark the
 * incident resolved; recovery is confirmed separately by verification.
 */
export function RemediationControls({ action }: { action: RemediationAction }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [op, setOp] = useState<null | "approve" | "reject" | "execute">(null);
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const run = (
    which: "approve" | "reject" | "execute",
    fn: () => Promise<ActionResult>,
  ) => {
    setOp(which);
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      setOp(null);
      if (res.ok) {
        setConfirming(false);
        setAck(false);
        router.refresh();
      }
    });
  };

  const Icon = STATUS_ICON[action.status];
  const needsStrongConfirm = action.risk !== "low";

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border-hairline bg-canvas p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[14px] font-semibold leading-5 text-ink">
            {action.title}
          </span>
          {action.description ? (
            <span className="text-[13px] leading-5 text-ink-secondary">
              {action.description}
            </span>
          ) : null}
        </div>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Badge
            tone={RISK_TONE[action.risk]}
            icon={<TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          >
            {RISK_LABEL[action.risk]}
          </Badge>
          <Badge
            tone={STATUS_TONE[action.status]}
            icon={<Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          >
            {REMEDIATION_STATUS_LABEL[action.status]}
          </Badge>
        </span>
      </div>

      {action.result ? (
        <p className="rounded border border-border-hairline bg-surface px-3 py-2 text-[12px] leading-5 text-ink-secondary">
          {action.result}
        </p>
      ) : null}

      {action.status === "proposed" ? (
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton
            variant="primary"
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            pending={pending && op === "approve"}
            disabled={pending}
            onClick={() => run("approve", () => approveRemediation(action.id))}
          >
            Approve
          </ActionButton>
          <ActionButton
            variant="danger"
            icon={<ShieldX className="h-4 w-4" aria-hidden="true" />}
            pending={pending && op === "reject"}
            disabled={pending}
            onClick={() => run("reject", () => rejectRemediation(action.id))}
          >
            Reject
          </ActionButton>
          <span className="text-[12px] text-ink-muted">
            Requires your approval — nothing runs until you approve it.
          </span>
        </div>
      ) : null}

      {action.status === "approved" ? (
        confirming ? (
          <div className="flex flex-col gap-3 rounded-md border border-warning-border bg-warning-tint p-3">
            <p className="inline-flex items-start gap-1.5 text-[13px] font-medium leading-5 text-warning">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              This applies the action to demo/simulated state and starts recovery
              verification. It does not resolve the incident on its own.
            </p>
            {needsStrongConfirm ? (
              <label className="flex items-start gap-2 text-[13px] leading-5 text-ink">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-brand focus:ring-2 focus:ring-brand/40"
                />
                I understand this is a {RISK_LABEL[action.risk].toLowerCase()} action on
                demo state.
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                variant="primary"
                icon={<Play className="h-4 w-4" aria-hidden="true" />}
                pending={pending && op === "execute"}
                disabled={pending || (needsStrongConfirm && !ack)}
                onClick={() => run("execute", () => executeRemediation(action.id))}
              >
                Confirm &amp; execute
              </ActionButton>
              <ActionButton
                variant="ghost"
                icon={<XCircle className="h-4 w-4" aria-hidden="true" />}
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                  setAck(false);
                }}
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              variant="primary"
              icon={<Play className="h-4 w-4" aria-hidden="true" />}
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Execute now
            </ActionButton>
            <span className="text-[12px] text-ink-muted">
              Approved. Review once more, then execute.
            </span>
          </div>
        )
      ) : null}

      {action.status === "applied" ? (
        <p className="inline-flex items-start gap-1.5 text-[12px] leading-5 text-ink-secondary">
          <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden="true" />
          Executed — verifying recovery with repeated health checks below.
        </p>
      ) : null}

      {action.status === "verified" ? (
        <p className="inline-flex items-start gap-1.5 text-[12px] leading-5 text-success">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Recovery verified for this action.
        </p>
      ) : null}

      {result && !result.ok ? (
        <p
          role="alert"
          className="inline-flex items-start gap-1.5 text-[12px] leading-5 text-critical"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {result.error}
        </p>
      ) : null}
    </li>
  );
}
