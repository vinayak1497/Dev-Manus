import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared wizard primitives — same tokens as the rest of the product. */

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  action,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Optional control pinned to the far right of the label row — e.g. the
   *  Environment info button. Kept outside the <label> so activating it never
   *  triggers label/control behaviour. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="flex items-center gap-1 text-[13px] font-medium text-ink"
        >
          {label}
          {required ? (
            <span className="text-critical" aria-hidden="true">
              *
            </span>
          ) : hint ? (
            <span className="font-normal text-ink-muted">({hint})</span>
          ) : null}
        </label>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
      {error ? (
        <p className="text-[12px] text-critical" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function inputClass(hasError: boolean): string {
  return cn(
    "h-10 w-full rounded border bg-surface px-3 text-[14px] text-ink shadow-card placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/20",
    hasError ? "border-critical" : "border-border-hairline focus:border-brand",
  );
}

export function areaClass(hasError: boolean): string {
  return cn(
    "min-h-[76px] w-full rounded border bg-surface px-3 py-2 text-[14px] text-ink shadow-card placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/20",
    hasError ? "border-critical" : "border-border-hairline focus:border-brand",
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-5 text-ink-muted">{children}</p>;
}

export function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border-hairline bg-surface p-4 shadow-card">
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="mt-0.5 text-[13px] leading-5 text-ink-secondary">{description}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}
