import { TriangleAlert } from "lucide-react";

/** PostgREST codes that mean "the schema isn't there", not "transient". */
const MISSING_SCHEMA_CODES = ["PGRST205", "42P01", "PGRST202"];

/**
 * Explains a failed `public.projects` read in terms the user can act on.
 *
 * The overwhelmingly common cause in this project is that
 * `supabase/migrations/*.sql` were never pushed to the linked project —
 * a setup problem, not an outage. Reporting it as "the service may be
 * temporarily unavailable" was actively misleading (RULE.md §25/§33).
 */
export function DatabaseSetupNotice({ message }: { message: string }) {
  const isMissingSchema = MISSING_SCHEMA_CODES.some((code) =>
    message.includes(code),
  );

  if (isMissingSchema) {
    return (
      <div className="rounded-md border border-warning-border bg-warning-tint p-4">
        <p className="flex items-start gap-2 text-[14px] font-semibold text-warning">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Database schema not installed</span>
        </p>
        <p className="mt-2 text-[14px] leading-6 text-ink-secondary">
          Your account works, but the tables this page reads don&apos;t exist
          yet in the linked Supabase project. The migrations in{" "}
          <code className="font-mono text-[13px]">supabase/migrations/</code>{" "}
          haven&apos;t been applied.
        </p>
        <pre className="mt-3 overflow-x-auto rounded border border-warning-border bg-surface p-3 font-mono text-[12px] leading-5 text-ink">
          supabase link --project-ref afbuzhsnnczfawuwnglr{`\n`}
          supabase db push
        </pre>
        <p className="mt-2 text-[12px] text-ink-secondary">
          Reload this page afterwards. Full setup steps are in{" "}
          <code className="font-mono text-[12px]">Docs/Auth-Resend-SMTP.md</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-critical-border bg-critical-tint p-4">
      <p className="flex items-start gap-2 text-[14px] font-semibold text-critical">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>We couldn&apos;t load your projects</span>
      </p>
      <p className="mt-2 text-[14px] leading-6 text-ink-secondary">
        Your account is fine — the project service rejected the query. Retry
        the page; if it keeps failing, share this reference with the backend
        logs.
      </p>
      <p className="mt-2 font-mono text-[12px] text-ink-secondary">
        Reference: projects_select_org_member · {message}
      </p>
    </div>
  );
}
