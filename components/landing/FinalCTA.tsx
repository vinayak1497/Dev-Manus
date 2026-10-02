import { ButtonLink } from "@/components/ui/Button";
import { REGISTER_HREF } from "@/lib/site";

export function FinalCTA() {
  return (
    <section id="get-started" aria-labelledby="cta-title" className="bg-ink text-white">
      <div className="mx-auto flex max-w-app flex-col items-center gap-5 px-4 py-16 text-center lg:px-8 lg:py-24">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-white/60">
          Get started
        </p>
        <h2 id="cta-title" className="max-w-2xl text-balance text-3xl font-semibold leading-10 tracking-tight sm:text-4xl sm:leading-[44px]">
          Your application should not be a mystery.
        </h2>
        <p className="max-w-xl text-pretty text-base leading-7 text-white/70">
          Connect your first project and see correlated health, incidents, and
          evidence in minutes. Authentication, projects, and dashboards are
          under active implementation — this preview starts with the landing
          experience.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href={REGISTER_HREF} withArrow>
            Add Your Project
          </ButtonLink>
          <ButtonLink href="#console-preview" variant="secondary" className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
            Explore Demo
          </ButtonLink>
        </div>
        <p className="font-mono text-[12px] text-white/50">
          Zero-cost · local-first · open-source telemetry
        </p>
      </div>
    </section>
  );
}
