import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CheckIcon, CrossIcon } from "@/components/ui/icons";

export function ProblemSection() {
  return (
    <section aria-labelledby="problem-title" className="bg-canvas">
      <div className="mx-auto max-w-app px-4 py-16 lg:px-8 lg:py-24">
        <SectionHeading
          eyebrow="The problem"
          title={<span id="problem-title">Production systems are connected. Failures rarely are.</span>}
          lede="Metrics live in one tool, logs in another, Kubernetes events somewhere else. Teams lose time stitching signals together while incidents grow."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-1 text-[18px] font-semibold text-ink">Standard fragmented view</h3>
            <p className="mb-4 text-[14px] text-ink-secondary">
              Five disconnected alerts for one underlying problem.
            </p>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              {[
                "CPU > 90% — alert",
                "Latency spike — separate alert",
                "HTTP 500 increase — separate alert",
                "Pod restart — separate alert",
                "DB timeout — separate alert",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 rounded bg-canvas px-3 py-2">
                  <CrossIcon className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                  <span className="font-mono text-[13px]">{line}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="border-brand/30 p-6 shadow-raised">
            <h3 className="mb-1 text-[18px] font-semibold text-ink">Correlated topology view</h3>
            <p className="mb-4 text-[14px] text-ink-secondary">
              One incident with linked evidence and a likely trigger.
            </p>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              {[
                "Incident #1042 — possible deployment-related regression",
                "Error rate +400% · latency +180% · pod restart",
                "Started 1 min after deployment v1.8.2",
                "Evidence: metrics + logs + K8s events linked",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 rounded bg-success-tint px-3 py-2">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span className="text-[13px] font-medium">{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </section>
  );
}
