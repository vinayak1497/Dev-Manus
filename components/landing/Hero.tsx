import { ButtonLink } from "@/components/ui/Button";
import { BackgroundPaths } from "@/components/ui/background-paths";
import { CheckIcon, TerminalIcon } from "@/components/ui/icons";
import { HeroTerminal } from "@/components/landing/HeroTerminal";
import { DEMO_HREF, REGISTER_HREF } from "@/lib/site";

export function Hero() {
  return (
    <section id="product" aria-labelledby="hero-title" className="relative overflow-hidden bg-canvas">
      {/* Animated path background — subtle brand-anchored motion behind hero */}
      <BackgroundPaths className="opacity-70" />
      {/* Readability veil so copy + terminal stay dominant over motion */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-canvas/70 via-canvas/30 to-canvas"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 h-[350px] w-[800px] max-w-none -translate-x-1/2 rounded-full bg-gradient-to-b from-brand/10 via-brand/5 to-transparent blur-3xl"
      />
      <div className="relative z-10 mx-auto grid max-w-app grid-cols-1 items-center gap-6 px-4 pb-16 pt-20 lg:grid-cols-12 lg:px-8 lg:pb-24 lg:pt-24">
        <div className="flex flex-col items-start gap-4 lg:col-span-7">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-light px-3 py-1 font-mono text-[12px] font-semibold uppercase tracking-wider text-brand">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            Intelligent DevOps Observability
          </p>
          <h1
            id="hero-title"
            className="text-balance text-[44px] font-bold leading-[1.08] tracking-tight text-ink sm:text-[56px] lg:text-[64px]"
          >
            Monitor. Detect. Prevent.{" "}
            <span className="text-brand">Keep your applications healthy.</span>
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-7 text-ink-secondary sm:text-lg sm:leading-8">
            DevOps Safeguard connects your code, infrastructure, services,
            deployments, and runtime signals into one intelligent view —
            helping teams detect failures early and understand what went wrong.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <ButtonLink href={REGISTER_HREF} withArrow>
              Add Your Project
            </ButtonLink>
            <ButtonLink href={DEMO_HREF} variant="secondary">
              <TerminalIcon className="h-5 w-5 text-ink-secondary" />
              Explore Demo
            </ButtonLink>
          </div>
          <p className="flex items-center gap-2 pt-1 text-[12px] font-medium leading-4 text-ink-secondary">
            <CheckIcon className="h-4 w-4 text-secondary" />
            Built for modern stacks: Docker · Kubernetes · GitHub · AWS / Multi-cloud
          </p>
        </div>

        {/* Animated Safeguard terminal — live product demonstration */}
        <div className="w-full lg:col-span-5">
          <HeroTerminal />
        </div>
      </div>
    </section>
  );
}
