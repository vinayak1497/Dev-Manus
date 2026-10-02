import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

const pillars = [
  {
    title: "Observe everything",
    text: "Metrics answer what is wrong, logs answer what happened, traces answer where — plus profiles, events, and security findings.",
  },
  {
    title: "Correlate before paging",
    text: "Weighted evidence scoring groups deployment, latency, errors, restarts, and DB signals into one incident.",
  },
  {
    title: "Explain with evidence",
    text: "Local AI investigates with read-only tools and links every interpretation back to verifiable telemetry.",
  },
];

export function ArchitecturePillars() {
  return (
    <section aria-labelledby="arch-title" className="bg-canvas">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Architecture"
          title={<span id="arch-title">Observe. Correlate. Understand. Act.</span>}
          lede="Open-source, local-first, zero-cost: OpenTelemetry → Prometheus / Loki / Tempo → NATS → Go control plane → Next.js dashboard."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {pillars.map((p) => (
            <Card key={p.title} className="p-6">
              <h3 className="text-[18px] font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-[14px] leading-6 text-ink-secondary">{p.text}</p>
            </Card>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center font-mono text-[12px] leading-6 text-ink-secondary">
          Collect → Normalize → Detect → Correlate → Investigate → Explain → Alert → Recommend
        </p>
      </div>
    </section>
  );
}
