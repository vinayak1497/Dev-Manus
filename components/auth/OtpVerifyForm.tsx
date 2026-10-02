"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BoxReveal, Input, Label } from "@/components/ui/auth";

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * OTP verification step. Reuses the auth design language (BoxReveal
 * headers, cursor-glow Input, brand submit, ghost resend, text links) —
 * no new visual system.
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

  return (
    <section className="mx-auto flex w-96 max-w-full flex-col gap-4 max-md:w-full">
      <BoxReveal boxColor="#E8F0FE" duration={0.3}>
        <h2 className="text-3xl font-bold text-ink">Check your email</h2>
      </BoxReveal>

      <BoxReveal boxColor="#E8F0FE" duration={0.3} className="pb-2">
        <p className="max-w-sm text-sm text-ink-secondary">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-ink">{email}</span>. Enter it below
          to continue — or just click the sign-in link in the same email.
        </p>
      </BoxReveal>

      {notice && (
        <p
          role="status"
          className="rounded-md border border-info-border bg-info-tint px-3 py-2.5 text-[13px] leading-5 text-info"
        >
          {notice}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate={false}>
        <section className="mb-4 grid grid-cols-1">
          <section className="flex flex-col gap-2">
            <BoxReveal boxColor="#E8F0FE" duration={0.3}>
              <Label htmlFor="otp-code">
                Verification code{" "}
                <span className="text-critical" aria-hidden="true">
                  *
                </span>
              </Label>
            </BoxReveal>

            <BoxReveal
              width="100%"
              boxColor="#E8F0FE"
              duration={0.3}
              className="flex w-full flex-col space-y-2"
            >
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
                onChange={(event) =>
                  setCode(event.target.value.replace(/[^0-9]/g, ""))
                }
              />
              <section className="h-4">
                {(codeError || error) && (
                  <p className="text-xs text-critical" role="alert">
                    {codeError ?? error}
                  </p>
                )}
              </section>
            </BoxReveal>
          </section>
        </section>

        <BoxReveal
          width="100%"
          boxColor="#E8F0FE"
          duration={0.3}
          overflow="visible"
        >
          <button
            className="block h-10 w-full rounded-md bg-brand font-medium text-white shadow-md transition-all outline-hidden hover:cursor-pointer hover:bg-brand-hover hover:shadow-lg active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
            type="submit"
            disabled={busy}
            aria-busy={busy}
          >
            {isVerifying ? "Verifying…" : "Verify code →"}
          </button>
        </BoxReveal>

        <BoxReveal boxColor="#E8F0FE" duration={0.3}>
          <section className="mt-4 text-center">
            <button
              className="text-sm text-brand outline-hidden hover:cursor-pointer hover:underline disabled:cursor-wait disabled:opacity-60 disabled:hover:no-underline"
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
          </section>
        </BoxReveal>

        <BoxReveal boxColor="#E8F0FE" duration={0.3}>
          <section className="mt-2 text-center">
            <button
              className="text-sm text-ink-secondary outline-hidden hover:cursor-pointer hover:text-ink hover:underline disabled:opacity-60"
              type="button"
              onClick={onBack}
              disabled={busy}
            >
              Use a different email
            </button>
          </section>
        </BoxReveal>

        <BoxReveal boxColor="#E8F0FE" duration={0.3}>
          <p className="mt-6 text-center text-[12px] leading-5 text-ink-secondary">
            No code yet? Check your spam folder, or wait a minute before
            requesting another one — new codes are rate-limited.
          </p>
        </BoxReveal>
      </form>
    </section>
  );
}
