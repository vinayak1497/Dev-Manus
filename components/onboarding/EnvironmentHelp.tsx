"use client";

import { useState, type ReactNode } from "react";
import { Code, FlaskConical, Info, ShieldCheck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { type Environment } from "@/lib/onboarding/types";

/**
 * Plain-language explanation of the three wizard environments.
 *
 * Keyed by the same `Environment` union the selector uses, so copy cannot
 * drift from the available options. Colour is never the only signal — each
 * row also carries a distinct icon and a distinct "How do I know?" rule
 * (RULE.md §6.4).
 */
const DETAILS: Record<
  Environment,
  {
    purpose: string;
    detail: string;
    examples: string[];
    quickCheck: string;
    icon: ReactNode;
    chip: string;
    accent: string;
    quickCheckClass: string;
  }
> = {
  Development: {
    purpose: "For building and testing new changes.",
    detail:
      "Use Development when you are actively coding, experimenting, or testing something before it is ready for real users.",
    examples: [
      "Your local computer",
      "A developer’s test server",
      "A personal development instance",
    ],
    quickCheck:
      "If developers are still making or testing changes here, choose Development.",
    icon: <Code className="h-4 w-4" aria-hidden="true" />,
    chip: "bg-brand-light text-brand",
    accent: "text-brand",
    quickCheckClass: "bg-brand-light/60 text-brand",
  },
  Staging: {
    purpose: "For testing the project before going live.",
    detail:
      "Use Staging when the project is set up almost like Production, but is mainly used for final testing and verification.",
    examples: [
      "A QA/testing server",
      "A preview environment for the team",
      "A copy of the production setup used before release",
    ],
    quickCheck:
      "If the team tests a release here before real users get it, choose Staging.",
    icon: <FlaskConical className="h-4 w-4" aria-hidden="true" />,
    chip: "bg-warning-tint text-warning",
    accent: "text-warning",
    quickCheckClass: "bg-warning-tint text-warning",
  },
  Production: {
    purpose: "The live environment used by real users.",
    detail:
      "Use Production when the project is actively serving real customers, users, or real business operations.",
    examples: [
      "Your live website",
      "Your real customer-facing API",
      "Your live application used by customers",
    ],
    quickCheck:
      "If real users depend on this environment, choose Production.",
    icon: <ShieldCheck className="h-4 w-4" aria-hidden="true" />,
    chip: "bg-success-tint text-success",
    accent: "text-success",
    quickCheckClass: "bg-success-tint text-success",
  },
};

const TITLE_ID = "environment-help-title";

/**
 * Info affordance for the Environment label row. Deliberately not
 * hover-only: it is a real button with an accessible name, `aria-expanded`,
 * `aria-controls`, and a 28px hit target around a 16px icon.
 */
export function EnvironmentHelp() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="What do Development, Staging and Production mean?"
        aria-expanded={open}
        aria-controls={TITLE_ID}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-canvas hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        labelledBy={TITLE_ID}
        panelClassName="max-w-[560px] p-0"
      >
        <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <div className="px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <h2
              id={TITLE_ID}
              className="pr-8 text-[18px] font-semibold tracking-tight text-ink"
            >
              Which environment is my project?
            </h2>
            <p className="mt-1.5 text-[14px] leading-6 text-ink-secondary">
              An environment tells us where your project is running and what
              it is being used for.
            </p>
          </div>

          <ul className="border-t border-border-hairline">
            {(Object.keys(DETAILS) as Environment[]).map((env, index) => {
              const d = DETAILS[env];
              return (
                <li
                  key={env}
                  className={
                    index === 0
                      ? "px-5 py-4 sm:px-6"
                      : "border-t border-border-hairline px-5 py-4 sm:px-6"
                  }
                >
                  <div className="flex gap-3">
                    <span
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded ${d.chip}`}
                    >
                      {d.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">
                        {env}{" "}
                        <span className="font-normal text-ink-secondary">
                          — {d.purpose}
                        </span>
                      </p>
                      <p className="mt-1 text-[13px] leading-5 text-ink-secondary">
                        {d.detail}
                      </p>
                      <p className="mt-2 text-[12px] leading-5 text-ink-muted">
                        <span className="font-medium text-ink-secondary">
                          Examples:{" "}
                        </span>
                        {d.examples.join(" · ")}
                      </p>
                      <p
                        className={`mt-2 rounded px-2 py-1.5 text-[12px] leading-5 ${d.quickCheckClass}`}
                      >
                        <span className="font-medium">How do I know? </span>
                        {d.quickCheck}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mx-5 mb-5 mt-4 rounded border border-info-border bg-info-tint px-3 py-2.5 text-[12px] leading-5 text-ink-secondary sm:mx-6">
            <span className="font-medium text-ink">Not sure? </span>
            Choose the environment based on what this project is being used for
            right now. You can change it later in Settings.
          </p>
        </div>
      </Modal>
    </>
  );
}