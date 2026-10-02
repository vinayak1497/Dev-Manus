/**
 * Instant-paint skeleton for Projects Home (Design.md §31 — never leave a
 * large blank area while loading; the skeleton mirrors the final layout so
 * there is no layout shift).
 */
function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-subtle motion-reduce:animate-none ${className}`}
    />
  );
}

export default function ProjectsLoading() {
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
      </div>

      <main
        id="main-content"
        className="mx-auto flex max-w-app flex-col gap-6 px-4 pb-16 pt-8 lg:px-8"
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex flex-col gap-2">
            <Bar className="h-9 w-48" />
            <Bar className="h-5 w-80" />
          </div>
          <Bar className="h-10 w-28" />
        </div>

        <Bar className="h-[74px] w-full" />

        <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
          <Bar className="h-10 w-full md:max-w-2xl" />
          <Bar className="h-10 w-64" />
        </div>

        <div
          role="status"
          aria-live="polite"
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-md border border-border-hairline bg-surface p-5 shadow-card"
            >
              <Bar className="h-6 w-2/3" />
              <Bar className="h-6 w-24" />
              <div className="grid grid-cols-2 gap-2">
                <Bar className="h-16" />
                <Bar className="h-16" />
              </div>
              <Bar className="h-24 w-full" />
            </div>
          ))}
          <span className="sr-only">Loading your projects…</span>
        </div>
      </main>
    </div>
  );
}
