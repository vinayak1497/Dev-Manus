import Link from "next/link";
import { SearchX, ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@/lib/site";

/**
 * Shown when a project id doesn't resolve. Because the lookup is RLS-scoped,
 * this covers both "no such project" and "not yours" — we deliberately don't
 * distinguish the two, so the page never confirms a project exists to someone
 * who can't access it.
 */
export default function ProjectNotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="mx-auto flex h-16 w-full max-w-app items-center gap-2 border-b border-border-hairline px-4 lg:px-8">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white"
        >
          DS
        </span>
        <span className="text-[16px] font-semibold tracking-tight text-ink">
          {PRODUCT_NAME}
        </span>
      </header>

      <main
        id="main-content"
        className="mx-auto flex w-full max-w-app flex-1 items-center justify-center px-4 py-16 lg:px-8"
      >
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-ink-muted">
            <SearchX className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Project not found
          </h1>
          <p className="text-[14px] leading-6 text-ink-secondary">
            This project doesn&apos;t exist, or it isn&apos;t part of an
            organization you belong to. Check the link, or head back to your
            projects.
          </p>
          <Link
            href="/projects"
            className="inline-flex h-10 items-center gap-2 rounded bg-brand px-4 text-[14px] font-semibold text-white shadow-md transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to projects
          </Link>
        </div>
      </main>
    </div>
  );
}
