import type { AnchorHTMLAttributes } from "react";
import { ArrowIcon } from "./icons";

type Variant = "primary" | "secondary" | "ghost";

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: Variant;
  withArrow?: boolean;
};

const styles: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover shadow-md hover:shadow-lg",
  secondary:
    "bg-surface text-ink border border-border hover:bg-canvas hover:border-ink-muted shadow-sm",
  ghost: "text-ink-secondary hover:bg-subtle hover:text-ink",
};

export function ButtonLink({
  variant = "primary",
  withArrow = false,
  className = "",
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <a
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded px-6 py-3 text-[16px] font-semibold leading-6 transition-all active:scale-[0.99] ${styles[variant]} ${className}`}
    >
      {children}
      {withArrow ? (
        <ArrowIcon className="h-5 w-5" />
      ) : null}
    </a>
  );
}
