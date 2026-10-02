import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AddProjectWizard } from "@/components/onboarding/AddProjectWizard";
import { PRODUCT_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: `Add project — ${PRODUCT_NAME}`,
  description: "Guided setup: connect a repository, review detected configuration, start monitoring.",
};

/**
 * /projects/new — full-page Add Project wizard (Screen_Navigation.md §7).
 * Same journey as the dialog; the page survives refresh via the wizard's
 * localStorage draft. Middleware gates /projects/* so only signed-in users
 * reach here; tenant isolation is enforced by RLS on create.
 */
export default function NewProjectPage() {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="mx-auto flex h-16 max-w-app items-center justify-between gap-4 border-b border-border-hairline px-4 lg:px-8">
        <Link
          href="/projects"
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          aria-label={`${PRODUCT_NAME} — all projects`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white"
          >
            DS
          </span>
          <span className="text-[16px] font-semibold tracking-tight text-ink">
            {PRODUCT_NAME}
          </span>
        </Link>
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 rounded text-[13px] font-medium text-ink-secondary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All projects
        </Link>
      </header>

      <main
        id="main-content"
        className="mx-auto w-full max-w-3xl px-4 pb-16 pt-8 lg:px-8"
      >
        <div className="rounded-lg border border-border-hairline bg-surface p-5 shadow-card sm:p-7">
          <AddProjectWizard embedded />
        </div>
        <p className="mt-4 text-center text-[12px] text-ink-muted">
          Your progress is saved in this browser while the wizard is open.
          Nothing is created until Review → Start Monitoring.
        </p>
      </main>
    </div>
  );
}
