"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { saveHealthConfiguration } from "@/app/projects/[id]/health-actions";
import {
  HEALTH_METHODS,
  validateHealthSettings,
  type HealthFieldErrors,
  type HealthMethod,
  type HealthSettingsInput,
} from "@/lib/monitoring/health-edit";
import {
  buildHealthCheckUrl,
  HEALTH_TARGET_TYPE_LABEL,
} from "@/lib/onboarding/health";
import { HEALTH_EXPECTED_STATUS_VALUES } from "@/lib/onboarding/validation";
import { isBlockedAddress } from "@/lib/monitoring/http-check";
import type { HealthTargetType } from "@/lib/onboarding/types";
import type { StoredHealth } from "@/lib/project-config";

const METHOD_LABEL: Record<HealthMethod, string> = {
  http: "HTTP endpoint",
  port: "Port",
  container: "Container",
};

const METHOD_HINT: Record<HealthMethod, string> = {
  http: "Sends an HTTP request to the target URL and endpoint path on a schedule.",
  port: "Stores a port to check. Automatic monitoring only probes HTTP methods, so no scheduled check runs.",
  container:
    "Stores a container check. Automatic monitoring only probes HTTP methods, so no scheduled check runs.",
};

const FIELDS: { id: keyof HealthSettingsInput; label: string; hint?: string }[] = [
  { id: "intervalSec", label: "Interval (seconds)", hint: "10–3600 seconds." },
  { id: "timeoutSec", label: "Timeout (seconds)", hint: "1–120 seconds." },
  {
    id: "failureThreshold",
    label: "Failure threshold",
    hint: "Consecutive failures before an incident opens.",
  },
];

function isMethod(value: unknown): value is HealthMethod {
  return (
    typeof value === "string" && (HEALTH_METHODS as readonly string[]).includes(value)
  );
}

function isTargetType(value: unknown): value is HealthTargetType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(HEALTH_TARGET_TYPE_LABEL, value)
  );
}

/**
 * The saved configuration, as editable form strings.
 *
 * Defaults match the onboarding wizard's defaults, so opening the editor on a
 * project that never stored a health block produces a valid starting point
 * instead of a set of empty numeric inputs.
 */
export function healthInputFromStored(health: StoredHealth | null): HealthSettingsInput {
  const method = isMethod(health?.method) ? health.method : "http";
  return {
    method,
    targetType: isTargetType(health?.targetType)
      ? health.targetType
      : method === "http"
        ? "external_url"
        : "unknown",
    targetUrl: health?.targetUrl ?? "",
    endpoint: health?.endpoint ?? "",
    expectedStatus: health?.expectedStatus ?? "200",
    intervalSec: health?.intervalSec ?? "30",
    timeoutSec: health?.timeoutSec ?? "5",
    failureThreshold: health?.failureThreshold ?? "3",
  };
}

const inputClass =
  "h-10 w-full rounded border bg-surface px-3 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-brand/20";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-[12px] leading-5 text-critical">
      {message}
    </p>
  );
}

/**
 * Editable health monitoring for the project dashboard.
 *
 * Saving writes configuration only. It deliberately does NOT run a check: until
 * the worker's next real observation, the card must say the new target is
 * unchecked rather than presenting the previous endpoint's result as proof.
 */
export function HealthMonitoringEditor({
  projectId,
  health,
}: {
  projectId: string;
  health: StoredHealth | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<HealthSettingsInput>(() =>
    healthInputFromStored(health),
  );
  const [fieldErrors, setFieldErrors] = useState<HealthFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const checkUrl =
    values.method === "http"
      ? buildHealthCheckUrl(values.targetUrl, values.endpoint).url
      : null;

  // Same static check the read-back card uses: a literal private host is the
  // case the worker's allowlist policy is most often confused about, so only
  // then is the warning worth the space.
  const privateHost = (() => {
    if (values.method !== "http") return null;
    try {
      const hostname = new URL(values.targetUrl).hostname;
      return /^\d+\.\d+\.\d+\.\d+$/.test(hostname) && isBlockedAddress(hostname)
        ? hostname
        : null;
    } catch {
      return null;
    }
  })();

  function openEditor() {
    // Re-seed from the current server data each time the dialog opens, so a
    // cancelled edit never lingers and a refresh is reflected.
    setValues(healthInputFromStored(health));
    setFieldErrors({});
    setError(null);
    setSaved(null);
    setWarning(null);
    setOpen(true);
  }

  function cancel() {
    setOpen(false);
    setValues(healthInputFromStored(health));
    setFieldErrors({});
    setError(null);
  }

  function setField(field: keyof HealthSettingsInput, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setError(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const checked = validateHealthSettings(values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setError("Check the highlighted fields.");
      return;
    }

    setFieldErrors({});
    setError(null);
    startTransition(async () => {
      const result = await saveHealthConfiguration(projectId, values);
      if (!result.ok) {
        setError(result.error ?? "The health configuration could not be saved.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      setSaved(result.message ?? "Health monitoring saved.");
      setWarning(result.warning ?? null);
      // The action revalidates the path; refresh so the read-back card and the
      // automatic-monitoring panel immediately reflect the stored settings.
      router.refresh();
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <ActionButton
        variant="secondary"
        className="self-start"
        icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={openEditor}
        aria-haspopup="dialog"
      >
        Edit health monitoring
      </ActionButton>

      {saved ? (
        <p
          role="status"
          className="flex items-start gap-1.5 text-[12px] leading-5 text-success"
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {saved}
        </p>
      ) : null}
      {warning ? (
        <p
          role="status"
          className="flex items-start gap-1.5 text-[12px] leading-5 text-warning"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      ) : null}

      <Modal
        open={open}
        // A save in flight must not be dismissable: closing here would hide the
        // outcome (including a failure) while the request is still running.
        onClose={() => {
          if (!pending) cancel();
        }}
        labelledBy="health-editor-title"
        panelClassName="w-full max-w-2xl p-5"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1 pr-8">
            <h2 id="health-editor-title" className="text-[16px] font-semibold text-ink">
              Edit health monitoring
            </h2>
            <p className="text-[13px] leading-5 text-ink-secondary">
              Changes apply to the next scheduled check. Saving does not run a
              check, so the dashboard keeps saying the target is unchecked until
              a real observation arrives.
            </p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded border border-critical-border bg-critical-tint px-3 py-2 text-[12px] leading-5 text-critical"
            >
              {error}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="health-method"
                className="text-[12px] font-medium text-ink-secondary"
              >
                Monitoring method
              </label>
              <select
                id="health-method"
                value={values.method}
                disabled={pending}
                onChange={(e) => setField("method", e.target.value)}
                aria-invalid={fieldErrors.method ? true : undefined}
                aria-describedby={fieldErrors.method ? "health-method-error" : undefined}
                className={inputClass}
              >
                {HEALTH_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {METHOD_LABEL[method]}
                  </option>
                ))}
              </select>
              <p className="text-[12px] leading-5 text-ink-muted">
                {METHOD_HINT[values.method as HealthMethod] ?? ""}
              </p>
              <FieldError id="health-method-error" message={fieldErrors.method} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="health-target-type"
                className="text-[12px] font-medium text-ink-secondary"
              >
                Target type
              </label>
              <select
                id="health-target-type"
                value={values.targetType}
                disabled={pending}
                onChange={(e) => setField("targetType", e.target.value)}
                aria-invalid={fieldErrors.targetType ? true : undefined}
                aria-describedby={
                  fieldErrors.targetType ? "health-target-type-error" : undefined
                }
                className={inputClass}
              >
                {(Object.keys(HEALTH_TARGET_TYPE_LABEL) as HealthTargetType[]).map(
                  (type) => (
                    <option key={type} value={type}>
                      {HEALTH_TARGET_TYPE_LABEL[type]}
                    </option>
                  ),
                )}
              </select>
              <FieldError
                id="health-target-type-error"
                message={fieldErrors.targetType}
              />
            </div>
          </div>

          {values.method === "http" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="health-target-url"
                  className="text-[12px] font-medium text-ink-secondary"
                >
                  Target URL
                </label>
                <input
                  id="health-target-url"
                  type="url"
                  inputMode="url"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="https://example.com"
                  value={values.targetUrl}
                  disabled={pending}
                  onChange={(e) => setField("targetUrl", e.target.value)}
                  aria-invalid={fieldErrors.targetUrl ? true : undefined}
                  aria-describedby={
                    fieldErrors.targetUrl ? "health-target-url-error" : undefined
                  }
                  className={inputClass}
                />
                {privateHost ? (
                  <p className="text-[12px] leading-5 text-warning">
                    Private target ({privateHost}) can be saved, but the worker
                    still refuses it unless that exact host is allowlisted by the
                    operator. Entering an IP here does not grant trust.
                  </p>
                ) : null}
                <FieldError id="health-target-url-error" message={fieldErrors.targetUrl} />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="health-endpoint"
                    className="text-[12px] font-medium text-ink-secondary"
                  >
                    Endpoint path
                  </label>
                  <input
                    id="health-endpoint"
                    type="text"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="/health"
                    value={values.endpoint}
                    disabled={pending}
                    onChange={(e) => setField("endpoint", e.target.value)}
                    aria-invalid={fieldErrors.endpoint ? true : undefined}
                    aria-describedby={
                      fieldErrors.endpoint ? "health-endpoint-error" : undefined
                    }
                    className={inputClass}
                  />
                  <FieldError id="health-endpoint-error" message={fieldErrors.endpoint} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="health-expected-status"
                    className="text-[12px] font-medium text-ink-secondary"
                  >
                    Expected HTTP status
                  </label>
                  <select
                    id="health-expected-status"
                    value={values.expectedStatus}
                    disabled={pending}
                    onChange={(e) => setField("expectedStatus", e.target.value)}
                    aria-invalid={fieldErrors.expectedStatus ? true : undefined}
                    aria-describedby={
                      fieldErrors.expectedStatus
                        ? "health-expected-status-error"
                        : undefined
                    }
                    className={inputClass}
                  >
                    {HEALTH_EXPECTED_STATUS_VALUES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="health-expected-status-error"
                    message={fieldErrors.expectedStatus}
                  />
                </div>
              </div>

              <p className="text-[12px] leading-5 text-ink-muted">
                Checked URL:{" "}
                <span className="font-mono text-ink-secondary">
                  {checkUrl ?? "Not a valid URL yet"}
                </span>
              </p>
            </>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {FIELDS.map((field) => (
              <div key={field.id} className="flex flex-col gap-1.5">
                <label
                  htmlFor={`health-${field.id}`}
                  className="text-[12px] font-medium text-ink-secondary"
                >
                  {field.label}
                </label>
                <input
                  id={`health-${field.id}`}
                  type="number"
                  min={1}
                  step={1}
                  value={values[field.id]}
                  disabled={pending}
                  onChange={(e) => setField(field.id, e.target.value)}
                  aria-invalid={fieldErrors[field.id] ? true : undefined}
                  aria-describedby={
                    fieldErrors[field.id] ? `health-${field.id}-error` : undefined
                  }
                  className={inputClass}
                />
                {fieldErrors[field.id] ? null : field.hint ? (
                  <p className="text-[12px] leading-5 text-ink-muted">{field.hint}</p>
                ) : null}
                <FieldError
                  id={`health-${field.id}-error`}
                  message={fieldErrors[field.id]}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border-hairline pt-4">
            <ActionButton
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={pending}
            >
              Cancel
            </ActionButton>
            <ActionButton
              type="submit"
              variant="primary"
              pending={pending}
              disabled={pending}
            >
              Save changes
            </ActionButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
