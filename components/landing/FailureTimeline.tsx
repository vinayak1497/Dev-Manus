import { SectionHeading } from "@/components/ui/SectionHeading";

const events = [
  { time: "14:00", title: "Deployment v1.8.2", detail: "Commit a71c9f rolled out to production.", tone: "info" },
  { time: "14:01", title: "Latency +180%", detail: "P95 deviation from 7-day baseline.", tone: "warning" },
  { time: "14:02", title: "DB contention", detail: "Connection timeouts in payments-api logs.", tone: "warning" },
  { time: "14:02", title: "Incident auto-created", detail: "5 signals correlated into #1042.", tone: "critical" },
  { time: "14:03", title: "AI synthesis", detail: "Possible deployment regression — evidence linked.", tone: "ai" },
] as const;

const toneDot: Record<string, string> = {
  info: "bg-info",
  warning: "bg-warning",
  critical: "bg-critical",
  ai: "bg-ai",
};

export function FailureTimeline() {
  return (
    <section aria-labelledby="detect-title" className="bg-canvas">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Detection"
          title={<span id="detect-title">Know something is wrong before users tell you.</span>}
          lede="Thresholds catch the obvious. Statistical baselines catch the subtle. Correlation turns five alerts into one actionable incident."
        />
        <ol className="mx-auto mt-10 max-w-3xl border-l-2 border-border pl-0">
          {events.map((e) => (
            <li key={e.time + e.title} className="relative flex gap-4 pb-6 pl-6 last:pb-0">
              <span
                aria-hidden="true"
                className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ${toneDot[e.tone]}`}
              />
              <div className="flex-1 rounded-md border border-border-hairline bg-surface px-4 py-3 shadow-card">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-ink-secondary">
                    {e.time}
                  </span>
                  <span className="text-[15px] font-semibold text-ink">{e.title}</span>
                </p>
                <p className="mt-0.5 text-[14px] text-ink-secondary">{e.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
