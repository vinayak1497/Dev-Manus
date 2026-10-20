"use client";

import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { BoxReveal, Input, Label } from "@/components/ui/auth";

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * OTP verification step. Uses the same card language as `AnimatedForm` —
 * icon tile, heading, supporting text, one field, one primary action — so the
 * step never looks like a different product.
 */
export function OtpVerifyForm({
  email,
  isVerifying,
  isResending,
  error,
  notice,
  onVerify,
  onResend,
  onBack,
}: {
  email: string;
  isVerifying: boolean;
  isResending: boolean;
  error: string | null;
  notice: string | null;
  onVerify: (code: string) => void;
  /** Resolves true only when a fresh code was actually sent. */
  onResend: () => Promise<boolean>;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const busy = isVerifying || isResending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code.trim();
    if (!/^\d{6}$/.test(value)) {
      setCodeError("Enter the 6-digit code from your email.");
      return;
    }
    setCodeError(null);
    onVerify(value);
  };

  const handleResend = async () => {
    if (cooldown > 0 || busy) return;
    // Only start the cooldown once the parent confirms a code was actually
    // sent. Starting it eagerly on click would lock the user out for a full
    // minute even when the request failed (network error / rate limit) and no
    // new code arrived.
    const sent = await onResend();
    if (sent) setCooldown(RESEND_COOLDOWN_SECONDS);
  };

  const fieldError = codeError ?? error;

  return (
    <section className="auth-form">
      <div className="auth-icon-tile" aria-hidden="true">
        <MailCheck size={22} />
      </div>

      <BoxReveal boxColor="var(--auth-reveal)" duration={0.3}>
        <h2 className="auth-heading">Check your email</h2>
      </BoxReveal>

      <BoxReveal boxColor="var(--auth-reveal)" duration={0.3}>
        <p className="auth-sub">
          We sent a 6-digit code to{" "}
          <span className="auth-emphasis">{email}</span>. Enter it below to
          continue — or just click the sign-in link in the same email.
        </p>
      </BoxReveal>

      {notice && (
        <p role="status" className="auth-notice">
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate={false}>
        <div className="auth-fields">
          <div className="auth-field">
            <Label htmlFor="otp-code" className="auth-label">
              Verification code
              <span className="auth-required" aria-hidden="true">
                {" *"}
              </span>
            </Label>

            <div className="auth-field__control">
              <span className="auth-field__icon" aria-hidden="true">
                <KeyRound size={16} />
              </span>
              <Input
                id="otp-code"
                name="otp-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                maxLength={6}
                value={code}
                disabled={busy}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "otp-code-error" : undefined}
                className="auth-input--icon"
                onChange={(event) =>
                  setCode(event.target.value.replace(/[^0-9]/g, ""))
                }
              />
            </div>

            <div className="auth-field__error">
              {fieldError && (
                <p id="otp-code-error" role="alert">
                  {fieldError}
                </p>
              )}
            </div>
          </div>
        </div>

        <button
          className="auth-submit"
          type="submit"
          disabled={busy}
          aria-busy={busy}
        >
          {isVerifying ? "Verifying…" : "Verify code"}
        </button>
      </form>

      <div className="auth-actions">
        <button
          className="auth-switch__btn"
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || busy}
        >
          {isResending
            ? "Sending…"
            : cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Resend code"}
        </button>
        <button
          className="auth-switch__link"
          type="button"
          onClick={onBack}
          disabled={busy}
        >
          Use a different email
        </button>
      </div>

      <p className="auth-footnote">
        No code yet? Check your spam folder, or wait a minute before requesting
        another one — new codes are rate-limited.
      </p>
    </section>
  );
}
