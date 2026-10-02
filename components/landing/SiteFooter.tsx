import { NAV_LINKS, PRODUCT_NAME } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border-hairline bg-surface">
      <div className="mx-auto grid max-w-app grid-cols-1 gap-8 px-4 py-12 sm:grid-cols-3 lg:px-8">
        <div>
          <p className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded bg-brand font-mono text-[14px] font-semibold text-white"
            >
              DS
            </span>
            <span className="text-[16px] font-semibold">{PRODUCT_NAME}</span>
          </p>
          <p className="mt-3 max-w-xs text-[14px] leading-6 text-ink-secondary">
            Monitor. Detect. Prevent. Keep your applications healthy.
          </p>
        </div>
        <nav aria-label="Footer">
          <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
            Product
          </p>
          <ul className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="text-[14px] text-ink-secondary hover:text-ink">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="mb-3 font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-secondary">
            Status
          </p>
          <p className="text-[14px] leading-6 text-ink-secondary">
            Landing preview — dashboards, incidents, and auth are future work
            per the implementation phases.
          </p>
        </div>
      </div>
      <div className="border-t border-border-hairline">
        <p className="mx-auto max-w-app px-4 py-4 text-[12px] text-ink-secondary lg:px-8">
          © 2026 {PRODUCT_NAME}. Demonstration preview — mock telemetry shown for illustration.
        </p>
      </div>
    </footer>
  );
}
