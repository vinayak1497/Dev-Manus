import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ai";

const styles: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent",
  secondary:
    "bg-surface text-ink border border-border hover:bg-canvas hover:border-ink-muted",
  ghost: "text-ink-secondary hover:bg-subtle hover:text-ink border border-transparent",
  danger:
    "bg-critical-tint text-critical border border-critical-border hover:bg-critical/10",
  ai: "bg-ai text-white hover:bg-ai/90 border border-transparent",
};

/**
 * Compact action button for the operational controls (approve / execute / run
 * monitor). Distinct from the marketing-scale {@link ButtonLink}: this is a real
 * <button> with a pending spinner, for client components that call server
 * actions inside a transition.
 */
export function ActionButton({
  variant = "secondary",
  pending = false,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  pending?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      {...rest}
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold leading-5 transition-all active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
