import { ProjectHealthBadge } from "./ProjectHealth";
import { formatRelativeTime, type ProjectSummary } from "@/lib/projects";

/**
 * Project table — list view of Projects Home (Screen_Navigation.md §6).
 * Horizontally scrollable on narrow screens so dense columns stay usable
 * (Design.md §28 / §35).
 */
export function ProjectTable({
  projects,
  now,
}: {
  projects: ProjectSummary[];
  now: number;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-hairline bg-surface shadow-card">
      <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
        <caption className="sr-only">
          Monitored projects with health, environment, services, incidents, and
          last deployment
        </caption>
        <thead>
          <tr className="border-b border-border-hairline bg-canvas text-[12px] uppercase tracking-wide text-ink-secondary">
            <th scope="col" className="px-4 py-3 font-semibold">
              Project
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Health
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Environment
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Services
            </th>
            <th scope="col" className="px-4 py-3 text-right font-semibold">
              Incidents
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Last deployment
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Last checked
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-hairline">
          {projects.map((project) => (
            <tr
              key={project.id}
              className="transition-colors hover:bg-canvas"
            >
              <th scope="row" className="px-4 py-3 text-left font-medium">
                <span className="block truncate font-semibold text-ink">
                  {project.name}
                </span>
                <span className="block truncate font-mono text-[12px] text-ink-secondary">
                  {project.slug}
                  {project.isDemo ? (
                    <span className="ml-2 font-sans text-ai">Sample</span>
                  ) : null}
                </span>
              </th>
              <td className="px-4 py-3">
                <ProjectHealthBadge health={project.health} />
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-ink-secondary">
                {project.environment ?? "Not set"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink">
                {project.serviceCount ?? "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-ink">
                {project.activeIncidentCount ?? "—"}
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-ink-secondary">
                {project.deployment
                  ? `${project.deployment.version} (${formatRelativeTime(project.deployment.deployedAt, now)})`
                  : "Not available"}
              </td>
              <td className="px-4 py-3 font-mono text-[12px] text-ink-secondary">
                {formatRelativeTime(project.lastCheckedAt, now)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
