import Link from "next/link";
import { FlaskConical, GitBranch, TriangleAlert } from "lucide-react";
import { TerminalIcon } from "@/components/ui/icons";
import { ProjectHealthBadge, ProjectHealthDot } from "./ProjectHealth";
import {
  formatAbsoluteTime,
  formatRelativeTime,
  type ProjectSummary,
} from "@/lib/projects";

function TelemetryValue({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-hairline pt-1.5 first:border-t-0 first:pt-0">
      <span className="text-ink-secondary">{label}</span>
      <span className={`truncate tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}

/**
 * Project card — grid view of Projects Home (Screen_Navigation.md §6).
 * Reference: Stitch Designs/User_Profile/code.html card markup.
 *
 * Unavailable telemetry renders as "Not available" / "—", never as a
 * fabricated number (RULE.md §9.1).
 */
export function ProjectCard({
  project,
  now,
}: {
  project: ProjectSummary;
  now: number;
}) {
  const hasTelemetry =
    project.health !== null || project.serviceCount !== null;

  return (
    <Link
      href={`/projects/${project.id}`}
      aria-label={`Open ${project.name}`}
      className="flex flex-col justify-between rounded-md border border-border-hairline bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <ProjectHealthDot health={project.health} />
            <h3 className="truncate text-[18px] font-semibold tracking-tight text-ink">
              {project.name}
            </h3>
          </div>
          <span className="shrink-0 font-mono text-[12px] text-ink-muted">
            {project.slug}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ProjectHealthBadge health={project.health} />
          {project.isDemo ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-ai-border bg-ai-tint px-2.5 py-1 font-mono text-[12px] font-medium leading-4 text-ai">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Sample
            </span>
          ) : null}
        </div>

        {/* Warning callout — real warning text only, never generated (RULE.md §9.1) */}
        {project.warning ? (
          <div className="flex items-start gap-2 rounded border border-warning-border bg-warning-tint p-2.5">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <p className="text-[13px] leading-tight text-warning">
              {project.warning}
            </p>
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border-hairline bg-canvas p-2.5">
            <dt className="text-[12px] text-ink-secondary">Services</dt>
            <dd className="mt-0.5 text-[18px] font-semibold tabular-nums text-ink">
              {project.serviceCount ?? "—"}
            </dd>
          </div>
          <div className="rounded border border-border-hairline bg-canvas p-2.5">
            <dt className="text-[12px] text-ink-secondary">Active incidents</dt>
            <dd className="mt-0.5 text-[18px] font-semibold tabular-nums text-ink">
              {project.activeIncidentCount ?? "—"}
            </dd>
          </div>
        </dl>

        {/* Telemetry meta block */}
        <div className="flex flex-col gap-1.5 rounded border border-border-hairline bg-canvas p-3 font-mono text-[12px]">
          <div className="flex items-center gap-2">
            {project.repository ? (
              <GitBranch className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            ) : (
              <TerminalIcon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
            )}
            <span className="truncate font-medium text-ink">
              {project.repository ?? "No repository connected"}
            </span>
          </div>

          {project.deployment ? (
            <div className="flex items-center justify-between gap-3 text-ink-secondary">
              <span className="truncate">
                Deploy {project.deployment.version} ·{" "}
                {formatRelativeTime(project.deployment.deployedAt, now)}
              </span>
              {project.deployment.commit ? (
                <span className="shrink-0 rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink">
                  {project.deployment.commit}
                </span>
              ) : null}
            </div>
          ) : (
            <TelemetryValue label="Last deployment" value="Not available" />
          )}

          <TelemetryValue
            label="Last checked"
            value={formatRelativeTime(project.lastCheckedAt, now)}
            valueClassName={project.lastCheckedAt ? "text-ink" : "text-ink-muted"}
          />

          <TelemetryValue
            label="Created"
            value={formatAbsoluteTime(project.createdAt)}
          />
        </div>

        {!hasTelemetry ? (
          <p className="text-[12px] leading-snug text-ink-secondary">
            Health telemetry is not available yet — this project has not been
            connected to a monitoring source.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-hairline pt-4">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-secondary">
          <ProjectHealthDot health={project.health} className="h-2 w-2" />
          <span className="truncate">
            {project.environment ?? "Environment not set"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[12px] text-ink-muted">
          Added {formatRelativeTime(project.createdAt, now)}
        </span>
      </div>
    </Link>
  );
}
