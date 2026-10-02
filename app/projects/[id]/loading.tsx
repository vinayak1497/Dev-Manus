/**
 * Instant-paint skeleton for the Project Dashboard — mirrors the real layout
 * (hero + three overview tiles + incidents list) so there is no layout shift
 * when the data resolves (Design.md §31).
 */
function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-subtle motion-reduce:animate-none ${className}`}
    />
  );
}

export default function ProjectDashboardLoading() {
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex h-16 max-w-app items-center justify-between gap-4 border-b border-border-hairline px-4 lg:px-8">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white">
            DS
          </span>
          <span className="text-[16px] font-semibold tracking-tight text-ink">
            DevOps Safeguard
          </span>
        </span>
        <Bar className="h-9 w-24" />
      </div>

      <main
        id="main-content"
        className="mx-auto flex max-w-app flex-col gap-6 px-4 pb-16 pt-8 lg:px-8"
        role="status"
        aria-live="polite"
      >
        <Bar className="h-5 w-28" />
        <div className="flex flex-col gap-2">
          <Bar className="h-9 w-64" />
          <Bar className="h-6 w-40" />
          <Bar className="h-5 w-80" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-md border border-border-hairline bg-surface p-5 shadow-card"
            >
              <div className="flex items-center justify-between">
                <Bar className="h-5 w-28" />
                <Bar className="h-7 w-10" />
              </div>
              <Bar className="h-16 w-full" />
            </div>
          ))}
        </div>

        <div className="rounded-md border border-border-hairline bg-surface p-5 shadow-card">
          <Bar className="mb-4 h-6 w-32" />
          <div className="flex flex-col gap-3">
            <Bar className="h-12 w-full" />
            <Bar className="h-12 w-full" />
          </div>
        </div>
        <span className="sr-only">Loading project…</span>
      </main>
    </div>
  );
}
