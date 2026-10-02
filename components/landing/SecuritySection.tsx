import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ShieldIcon } from "@/components/ui/icons";

const stages = ["Commit", "Image scan", "Config scan", "Deploy", "Runtime"];

export function SecuritySection() {
  return (
    <section id="resources" aria-labelledby="sec-title" className="bg-canvas">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="Security"
          title={<span id="sec-title">Secure the code that reaches production.</span>}
          lede="Image, Kubernetes, configuration, and dependency findings mapped to the services and deployments they actually affect."
        />
        <Card className="mx-auto mt-10 max-w-4xl p-5 sm:p-6">
          <ol className="flex flex-col gap-0 sm:flex-row sm:items-stretch" aria-label="Security pipeline">
            {stages.map((s, i) => (
              <li key={s} className="flex flex-1 items-center gap-2 py-2 sm:flex-col sm:gap-2 sm:py-0 sm:text-center">
                <span className="flex h-9 w-9 items-center justify-center rounded bg-ink text-white">
                  <ShieldIcon className="h-5 w-5" />
                </span>
                <span className="text-[13px] font-semibold">{s}</span>
                {i < stages.length - 1 ? (
                  <span aria-hidden="true" className="ml-auto hidden font-mono text-ink-muted sm:ml-0 sm:mt-1 sm:block">→</span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded bg-canvas px-4 py-3 font-mono text-[12px] leading-6 text-ink-secondary">
            finding <span className="text-critical">✕ CVE-2026-XXXX (high)</span> → dependency
            payments-lib@2.4.1 → service payments-api → deployment v1.8.2 (production)
          </p>
        </Card>
      </div>
    </section>
  );
}
