import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const steps = [
  { n: "01", title: "Connect", text: "Link repository, runtime, and infrastructure for a project." },
  { n: "02", title: "Monitor", text: "Collect metrics, logs, traces, and K8s events via OpenTelemetry." },
  { n: "03", title: "Detect", text: "Deterministic thresholds plus explainable statistical baselines." },
  { n: "04", title: "Correlate", text: "Group related signals into a single incident with evidence." },
  { n: "05", title: "Analyze", text: "AI summarizes observations, evidence, and confidence." },
  { n: "06", title: "Alert", text: "Route the right incident to in-app, webhook, or chat channels." },
  { n: "07", title: "Resolve", text: "Track timeline, verify recovery, and record the outcome." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="bg-surface">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="How it works"
          title={<span id="how-title">From connection to resolution in seven steps</span>}
          lede="An operational loop — Observe → Detect → Investigate → Understand → Act → Verify — backed by deterministic detection first and AI explanation second."
        />
        <ol className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n}>
              <Card className="h-full p-5">
                <p className="font-mono text-[12px] font-semibold text-brand">Step {s.n}</p>
                <h3 className="mt-1 text-[16px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-6 text-ink-secondary">{s.text}</p>
              </Card>
            </li>
          ))}
          <li className="sm:col-span-2 lg:col-span-1">
            <Card className="flex h-full flex-col justify-center bg-ink p-5 text-white">
              <p className="text-[16px] font-semibold">Start with your first project</p>
              <p className="mt-1 text-[14px] leading-6 text-white/70">
                Guided setup discovers framework, runtime, and services.
              </p>
              <a
                href="#get-started"
                className="mt-3 inline-flex w-fit items-center rounded bg-white px-4 py-2 text-[14px] font-semibold text-ink hover:bg-brand-light"
              >
                Add Your Project
              </a>
            </Card>
          </li>
        </ol>
      </div>
    </section>
  );
}
