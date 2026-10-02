import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const tiles = [
  { title: "Applications", text: "Requests, errors, latency, saturation per service." },
  { title: "Services & RPC", text: "Dependency graph: API → auth, payments → database." },
  { title: "Infrastructure", text: "CPU, memory, disk, network across hosts and VMs." },
  { title: "Kubernetes", text: "Cluster → namespace → workload → pod → container." },
  { title: "Logs", text: "Centralized search with severity, service, and time filters." },
  { title: "Metrics", text: "Prometheus time-series with thresholds and baselines." },
  { title: "Deployments", text: "Versions, commits, and rollout-correlated anomalies." },
  { title: "Dependencies", text: "Third-party APIs, queues, and backing services." },
  { title: "Security findings", text: "Image, config, and dependency scans tied to runtime." },
];

export function MonitoringGrid() {
  return (
    <section id="capabilities" aria-labelledby="cap-title" className="bg-surface">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Coverage"
          title={<span id="cap-title">Everything that affects application health.</span>}
          lede="Nine observability domains feed one incident model — no signal investigated in isolation."
        />
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <li key={t.title}>
              <Card className="h-full p-5 transition-shadow hover:shadow-raised">
                <h3 className="text-[16px] font-semibold text-ink">{t.title}</h3>
                <p className="mt-1.5 text-[14px] leading-6 text-ink-secondary">{t.text}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
