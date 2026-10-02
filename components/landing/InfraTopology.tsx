import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CheckIcon, CrossIcon, WarnIcon } from "@/components/ui/icons";

function Pod({ state }: { state: "ok" | "warn" | "bad" }) {
  const cls =
    state === "ok"
      ? "bg-success-tint text-success border-success-border"
      : state === "warn"
        ? "bg-warning-tint text-warning border-warning-border"
        : "bg-critical-tint text-critical border-critical-border";
  const label = state === "ok" ? "●" : state === "warn" ? "▲" : "✕";
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-sm border text-[12px] font-bold ${cls}`}
      aria-label={state === "ok" ? "healthy pod" : state === "warn" ? "degraded pod" : "failed pod"}
    >
      {label}
    </span>
  );
}

export function InfraTopology() {
  return (
    <section id="technology" aria-labelledby="infra-title" className="bg-surface">
      <div className="mx-auto grid max-w-app grid-cols-1 items-center gap-8 px-4 py-16 lg:grid-cols-2 lg:px-8 lg:py-24">
        <div>
          <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-brand">
            Infrastructure
          </p>
          <h2 id="infra-title" className="mt-3 text-balance text-3xl font-semibold leading-10 tracking-tight sm:text-4xl sm:leading-[44px]">
            Understand what is running underneath your code.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-base leading-7 text-ink-secondary">
            Nodes, containers, and Kubernetes workloads in one drill-down:
            cluster → namespace → workload → pod → container, with restart
            counts, resource pressure, and scheduling failures surfaced first.
          </p>
          <ul className="mt-5 flex flex-col gap-2 text-[14px]">
            <li className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-success" /> ● Node pressure and OOMKilled states
            </li>
            <li className="flex items-center gap-2">
              <WarnIcon className="h-4 w-4 text-warning" /> ▲ CrashLoopBackOff and image-pull failures
            </li>
            <li className="flex items-center gap-2">
              <CrossIcon className="h-4 w-4 text-critical" /> ✕ Pending pods and unschedulable workloads
            </li>
          </ul>
        </div>
        <Card className="p-5 shadow-raised sm:p-6" aria-label="Cluster topology preview">
          <p className="mb-4 font-mono text-[12px] text-ink-secondary">prod-cluster · 2 nodes · 9 pods</p>
          <div className="flex flex-col gap-4">
            <div className="rounded border border-border-hairline p-4">
              <p className="mb-3 text-[14px] font-semibold">node-1 <span className="font-mono text-[12px] font-normal text-ink-secondary">· CPU 68% · MEM 71%</span></p>
              <div className="flex flex-wrap gap-2">
                <Pod state="ok" /><Pod state="ok" /><Pod state="warn" /><Pod state="ok" /><Pod state="ok" />
              </div>
            </div>
            <div className="rounded border border-critical-border bg-critical-tint/40 p-4">
              <p className="mb-3 text-[14px] font-semibold">node-2 <span className="font-mono text-[12px] font-normal text-critical">✕ CPU 94% · 3 restarts</span></p>
              <div className="flex flex-wrap gap-2">
                <Pod state="ok" /><Pod state="bad" /><Pod state="warn" /><Pod state="ok" />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
