import type { ReactNode } from "react";
import { Ripple, TechOrbitDisplay } from "@/components/ui/auth";
import { PRODUCT_NAME } from "@/lib/site";

function OrbitChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-hairline bg-surface px-3 py-1.5 font-mono text-[12px] font-medium text-ink-secondary shadow-card">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
      {label}
    </span>
  );
}

// Each orbit ring carries two chips. To sit on opposite sides they must start
// half a revolution apart: the second chip's `delay` is duration/2, and the
// first must be an explicit `delay: 0`. Omitting it falls back to
// OrbitingCircles' default delay (10s), which lands both chips ~1s apart and
// makes them bunch together.
const STACK = [
  { label: "Docker", radius: 110, duration: 22, delay: 0, reverse: false },
  { label: "Kubernetes", radius: 110, duration: 22, delay: 11, reverse: false },
  { label: "Prometheus", radius: 175, duration: 28, delay: 0, reverse: true },
  { label: "OpenTelemetry", radius: 175, duration: 28, delay: 14, reverse: true },
  { label: "PostgreSQL", radius: 240, duration: 34, delay: 0, reverse: false },
  { label: "GitHub", radius: 240, duration: 34, delay: 17, reverse: false },
];

export function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.5z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.4 7.4 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5.2l3.8-2.8z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.6 1.4 6.8l3.8 2.9c1-2.9 3.7-5 6.8-5z"
      />
    </svg>
  );
}

/**
 * Split-screen auth shell: orbit visual on the left (desktop only),
 * form on the right, minimal top bar. Light theme throughout.
 */
export function AuthShell({
  children,
  orbitWord,
}: {
  children: ReactNode;
  orbitWord: string;
}) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-app items-center justify-between px-4 lg:px-8">
        <a href="/" className="flex items-center gap-2" aria-label={`${PRODUCT_NAME} home`}>
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white"
          >
            DS
          </span>
          <span className="text-[16px] font-semibold tracking-tight text-ink">
            {PRODUCT_NAME}
          </span>
        </a>
        <a
          href="/"
          className="rounded border border-border px-4 py-2 text-[14px] font-medium text-ink transition-colors hover:bg-surface"
        >
          Back to home
        </a>
      </header>

      <main className="mx-auto flex max-w-app items-stretch justify-center px-4 pb-16 lg:px-8">
        <div className="relative hidden w-1/2 flex-col justify-center overflow-hidden lg:flex" aria-hidden="true">
          <Ripple mainCircleSize={100} numCircles={9} />
          <TechOrbitDisplay
            text={orbitWord}
            iconsArray={STACK.map((s) => ({
              component: () => <OrbitChip label={s.label} />,
              className: "border-none bg-transparent shadow-none",
              duration: s.duration,
              delay: s.delay,
              radius: s.radius,
              path: false,
              reverse: s.reverse,
            }))}
          />
          <p className="relative z-10 mx-auto -mt-6 max-w-sm text-center text-[14px] leading-6 text-ink-secondary">
            Your projects, services, and incidents — correlated and explained.
          </p>
        </div>

        <div className="flex min-h-[calc(100dvh-8rem)] w-full flex-col items-center justify-center py-8 lg:w-1/2">
          {children}
        </div>
      </main>
    </div>
  );
}
