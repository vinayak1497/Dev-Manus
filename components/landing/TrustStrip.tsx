const items = [
  "Docker",
  "Kubernetes",
  "GitHub",
  "Prometheus",
  "OpenTelemetry",
  "PostgreSQL",
  "AWS",
  "Grafana",
];

export function TrustStrip() {
  return (
    <section aria-label="Supported technologies" className="border-y border-border-hairline bg-surface">
      <div className="mx-auto flex max-w-app flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 lg:px-8">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
          Works with your stack
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Integrations">
          {items.map((item) => (
            <li key={item} className="text-[14px] font-medium text-ink-secondary">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
