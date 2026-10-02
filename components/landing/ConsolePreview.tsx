import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CheckIcon, CrossIcon, DotIcon, WarnIcon } from "@/components/ui/icons";

const kpis = [
  { label: "Monitored services", value: "12", sub: "1 degraded" },
  { label: "Active incidents", value: "1", sub: "▲ High severity" },
  { label: "Availability (24h)", value: "99.94%", sub: "↑ 0.12% vs prior" },
  { label: "Error rate", value: "0.42%", sub: "P95 latency 212ms" },
];

export function ConsolePreview() {
  return (
    <section id="console-preview" aria-labelledby="console-title" className="bg-canvas">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Console preview"
          title={<span id="console-title">See your entire system at a single glance.</span>}
          lede="Global health first, then trends, then active problems — critical failures always dominate calm background state."
        />
        <Card className="mt-10 overflow-hidden shadow-raised">
          <div className="flex items-center justify-between border-b border-border-hairline px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 rounded-full bg-critical/70" />
              <span aria-hidden="true" className="h-3 w-3 rounded-full bg-warning/70" />
              <span aria-hidden="true" className="h-3 w-3 rounded-full bg-success/70" />
              <span className="ml-2 font-mono text-[12px] text-ink-secondary">
                ShopEasy · Production
              </span>
            </div>
            <div className="hidden gap-2 sm:flex">
              <Badge tone="healthy" icon={<DotIcon className="h-2 w-2" />}>● 11 healthy</Badge>
              <Badge tone="warning" icon={<WarnIcon className="h-3.5 w-3.5" />}>▲ 1 degraded</Badge>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="hidden border-r border-border-hairline p-4 lg:col-span-2 lg:block">
              <ul className="flex flex-col gap-1 text-[13px] font-medium text-ink-secondary">
                {["Dashboard", "Health & Incidents", "Services", "Kubernetes", "Logs", "Metrics", "AI Insights"].map(
                  (item, i) => (
                    <li
                      key={item}
                      className={`rounded px-3 py-2 ${i === 0 ? "bg-brand-light font-semibold text-brand" : ""}`}
                      aria-current={i === 0 ? "page" : undefined}
                    >
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>
            <div className="p-4 sm:p-6 lg:col-span-10">
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {kpis.map((k) => (
                  <div key={k.label} className="rounded border border-border-hairline bg-surface p-4">
                    <dt className="text-[12px] font-medium text-ink-secondary">{k.label}</dt>
                    <dd className="mt-0.5 text-[24px] font-semibold tabular-nums text-ink">{k.value}</dd>
                    <dd className="font-mono text-[12px] text-ink-secondary">{k.sub}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 overflow-x-auto rounded border border-critical-border bg-critical-tint">
                <table className="w-full min-w-[560px] text-left text-[13px]">
                  <caption className="sr-only">Active incidents preview</caption>
                  <thead>
                    <tr className="border-b border-critical-border text-[12px] uppercase tracking-wide text-critical">
                      <th scope="col" className="px-4 py-2.5">Severity</th>
                      <th scope="col" className="px-4 py-2.5">Incident</th>
                      <th scope="col" className="px-4 py-2.5">Service</th>
                      <th scope="col" className="px-4 py-2.5">Started</th>
                      <th scope="col" className="px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-surface">
                    <tr className="border-b border-border-hairline">
                      <td className="px-4 py-3 font-semibold text-critical">✕ High</td>
                      <td className="px-4 py-3 font-medium">API latency increased</td>
                      <td className="px-4 py-3 font-mono text-[12px]">payments-api</td>
                      <td className="px-4 py-3 tabular-nums">14:01 · 22m</td>
                      <td className="px-4 py-3">Investigating</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-semibold text-warning">▲ Medium</td>
                      <td className="px-4 py-3 font-medium">DB connection pool pressure</td>
                      <td className="px-4 py-3 font-mono text-[12px]">postgres</td>
                      <td className="px-4 py-3 tabular-nums">14:02 · 21m</td>
                      <td className="px-4 py-3">Acknowledged</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <CheckIcon className="h-4 w-4 text-success" /> ● Recovery tracked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CrossIcon className="h-4 w-4 text-critical" /> ✕ Evidence-linked timeline
                </span>
                <span className="font-mono">Last updated 30s ago · auto-refresh on</span>
              </p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
