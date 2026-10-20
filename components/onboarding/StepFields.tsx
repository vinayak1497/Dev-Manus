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
  // 13px secondary: helper text must stay readable, never fade into the page.
  return <p className="text-[13px] leading-6 text-ink-secondary">{children}</p>;
}

export function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  /** Small recognition mark beside the title (lucide, currentColor). */
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-border-hairline bg-surface p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
        {icon ? (
          <span className="text-ink-muted" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {title}
      </h3>
      {description ? (
        <p className="mt-0.5 text-[13px] leading-5 text-ink-secondary">{description}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * Borderless configuration group — the default grouping inside wizard steps.
 * Related fields are grouped by spacing and a heading, not by stacking
 * bordered cards inside bordered cards. Reach for SectionCard only when the
 * group is a record-like summary (review) or genuinely needs a boundary.
 */
export function FieldGroup({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="text-ink-muted" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-5 text-ink-secondary">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/**
 * One selectable card for mutually exclusive choices. Always rendered with
 * role="radio" + aria-checked by the caller; keyboard and screen-reader
 * behaviour comes from that, not from styling. States: default, hover,
 * selected (brand border + tint), focus-visible ring, disabled.
 */
export function OptionCard({
  selected,
  onSelect,
  label,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  /** Accessible name announced for the option. */
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-md border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        selected
          ? "border-brand bg-brand-light/50"
          : "border-border-hairline bg-surface hover:border-ink-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-brand" : "border-border",
        )}
      >
        {selected ? <span className="h-2 w-2 rounded-full bg-brand" /> : null}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/** Title + description lines for an option card's content. */
export function OptionCardText({ title, description }: { title: string; description?: string }) {
  return (
    <span className="block min-w-0">
      <span className="block text-[14px] font-semibold text-ink">{title}</span>
      {description ? (
        <span className="mt-0.5 block text-[13px] leading-5 text-ink-secondary">{description}</span>
      ) : null}
    </span>
  );
}
