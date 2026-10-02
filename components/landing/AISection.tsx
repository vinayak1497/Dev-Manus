import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CheckIcon, SparkIcon } from "@/components/ui/icons";

const evidence = [
  "Deployment v1.8.2 occurred 8 min before onset (+30)",
  "Error rate anomaly +400% (+25)",
  "P95 latency anomaly +180% (+20)",
  "DB connection failures appeared (+20)",
];

export function AISection() {
  return (
    <section aria-labelledby="ai-title" className="bg-surface">
      <div className="mx-auto grid max-w-app grid-cols-1 items-start gap-8 px-4 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-ai">
            AI-assisted investigation
          </p>
          <h2 id="ai-title" className="mt-3 text-balance text-3xl font-semibold leading-10 tracking-tight sm:text-4xl sm:leading-[44px]">
            Don&apos;t just know that something broke. Understand why.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-ink-secondary">
            Deterministic detection comes first; AI explains second — with
            observations separated from interpretations, confidence stated,
            and every claim linked back to evidence.
          </p>
          <ul className="mt-5 flex flex-col gap-2">
            {["Observation — what was detected", "Evidence — supporting signals", "Interpretation — possible explanation", "Confidence + suggested next step"].map(
              (line) => (
                <li key={line} className="flex items-center gap-2 text-[14px] text-ink-secondary">
                  <CheckIcon className="h-4 w-4 text-ai" /> {line}
                </li>
              )
            )}
          </ul>
        </div>
        <Card className="border-ai-border p-5 shadow-raised sm:p-6">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="ai" icon={<SparkIcon className="h-3.5 w-3.5" />}>
              ✦ Possible root cause
            </Badge>
            <span className="font-mono text-[12px] text-ink-secondary">confidence: moderate</span>
          </p>
          <p className="mt-3 text-[15px] leading-7 text-ink">
            API deployment <span className="font-mono">v1.8.2</span> may have
            introduced increased database queries. Evidence suggests a
            deployment-related regression — consider investigating the payments
            service diff and query profile.
          </p>
          <ul className="mt-4 flex flex-col gap-2">
            {evidence.map((line) => (
              <li key={line} className="flex items-start gap-2 rounded bg-ai-tint px-3 py-2 text-[13px]">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
                <span className="font-mono text-[12px] leading-5">{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
