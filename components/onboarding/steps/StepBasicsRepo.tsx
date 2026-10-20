import type { Dispatch, SetStateAction } from "react";
import { GitBranch } from "lucide-react";
import { WIZARD_ENVIRONMENTS, type WizardState } from "@/lib/onboarding/types";
import { EnvironmentHelp } from "../EnvironmentHelp";
import { Field, Hint, OptionCard, SectionCard, areaClass, inputClass } from "../StepFields";

export type StepProps = {
  state: WizardState;
  setState: Dispatch<SetStateAction<WizardState>>;
  errors: Record<string, string>;
};

function parseTagsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-_]/g, ""))
    .filter(Boolean)
    .slice(0, 8);
}

/** Step 1 — Project Basics: name, description, tags, environment. */
export function StepBasics({ state, setState, errors }: StepProps) {
  const b = state.basics;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-6 text-ink-secondary">
        Name your project so the team recognises it. Everything here can be
        changed later in Settings.
      </p>

      <Field label="Project name" htmlFor="ob-name" error={errors.name} required>
        <input
          id="ob-name"
          type="text"
          value={b.name}
          maxLength={80}
          placeholder="e.g. Payments API"
          autoComplete="off"
          onChange={(e) =>
            setState((s) => ({
              ...s,
              basics: { ...s.basics, name: e.target.value },
            }))
          }
          className={inputClass(!!errors.name)}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="ob-desc"
        error={errors.description}
        hint="Optional"
      >
        <textarea
          id="ob-desc"
          value={b.description}
          maxLength={280}
          placeholder="What does this application do?"
          onChange={(e) =>
            setState((s) => ({
              ...s,
              basics: { ...s.basics, description: e.target.value },
            }))
          }
          className={areaClass(!!errors.description)}
        />
      </Field>

      <Field label="Tags" htmlFor="ob-tags" error={errors.tags} hint="Optional, comma-separated">
        <input
          id="ob-tags"
          type="text"
          value={b.tags.join(", ")}
          placeholder="api, payments, production"
          autoComplete="off"
          onChange={(e) =>
            setState((s) => ({
              ...s,
              basics: { ...s.basics, tags: parseTagsInput(e.target.value) },
            }))
          }
          className={inputClass(!!errors.tags)}
        />
        <Hint>
          Lowercase letters, numbers, dashes. Used for search and grouping.
        </Hint>
      </Field>

      <Field
        label="Environment"
        htmlFor="ob-env"
        error={errors.environment}
        required
        action={<EnvironmentHelp />}
      >
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Environment">
          {WIZARD_ENVIRONMENTS.map((env) => {
            const selected = b.environment === env;
            return (
              <OptionCard
                key={env}
                selected={selected}
                label={`Environment: ${env}`}
                onSelect={() =>
                  setState((s) => ({ ...s, basics: { ...s.basics, environment: env } }))
                }
              >
                <span className="block py-0.5 text-center text-[13px] font-semibold text-ink">
                  {env}
                </span>
              </OptionCard>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

/** Step 2 — Repository Connection. Honest: no OAuth exists in this build. */
export function StepRepository({ state, setState, errors }: StepProps) {
  const r = state.repository;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-6 text-ink-secondary">
        Paste a repository URL so analysis can read what is really there.
        A public GitHub URL is inspected automatically. Without one you can
        still finish setup and configure everything by hand.
      </p>

      <SectionCard
        title="GitHub — Not connected"
        description="Add a public repository URL and the wizard inspects it for you. Don't have a public repository? You can continue and configure the project manually."
        icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}
      >
        <Field label="Repository URL" htmlFor="ob-repo" error={errors.url} hint="Optional">
          <input
            id="ob-repo"
            type="text"
            value={r.url}
            maxLength={200}
            inputMode="url"
            placeholder="https://github.com/org/repo"
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value;
              const provider = /github\.com/i.test(v)
                ? "github"
                : v.trim()
                  ? "other"
                  : "";
              setState((s) => ({
                ...s,
                repository: {
                  ...s.repository,
                  url: v,
                  provider: provider as typeof s.repository.provider,
                  connection: v.trim() ? "url_only" : "not_connected",
                },
                // A new URL invalidates the previous analysis.
                analysis: v.trim() !== s.repository.url.trim() ? null : s.analysis,
                analysisStatus:
                  v.trim() !== s.repository.url.trim() ? "idle" : s.analysisStatus,
              }));
            }}
            className={inputClass(!!errors.url)}
          />
        </Field>

        <Field label="Branch" htmlFor="ob-branch" error={errors.branch} hint="Optional, defaults to main">
          <input
            id="ob-branch"
            type="text"
            value={r.branch}
            maxLength={100}
            placeholder="main"
            autoComplete="off"
            onChange={(e) =>
              setState((s) => ({
                ...s,
                repository: { ...s.repository, branch: e.target.value },
                analysis: null,
                analysisStatus: "idle",
              }))
            }
            className={inputClass(!!errors.branch)}
          />
        </Field>
      </SectionCard>

      <Hint>
        No repository? Continue — every later step has a manual path and the
        project still completes.
      </Hint>
    </div>
  );
}
