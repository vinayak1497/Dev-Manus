"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatedForm } from "@/components/ui/auth";
import { AuthShell, GoogleIcon } from "@/components/auth/AuthShell";
import { OtpVerifyForm } from "@/components/auth/OtpVerifyForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { PROJECTS_HREF } from "@/lib/site";

const OAUTH_NOTICE =
  "Continue with Google isn't configured yet — please create your account with email and password.";
const CONFIG_NOTICE =
  "Authentication isn't configured yet. Add the Supabase keys to .env.local (see Docs/Auth-Resend-SMTP.md).";
const PASSWORD_MISMATCH = "Passwords do not match. Please try again.";
const ALREADY_REGISTERED =
  "An account with this email already exists. Try signing in instead.";
/** Seconds the submit action stays disabled after a send attempt. */
const SEND_COOLDOWN_SECONDS = 60;

/** Internal paths only — never redirect to external URLs from ?next=. */
function sanitizeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return PROJECTS_HREF;
}

type Step = "credentials" | "otp";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));
  const { user, isLoading, isConfigured, signUp, verifySignupCode, resendSignupCode } =
    useAuth();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Never let a user burn another email attempt immediately after one.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(next);
    }
  }, [isLoading, user, next, router]);

  const goToProjects = () => {
    router.replace(next);
    router.refresh();
  };

  const handleCredentialsSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (isSubmitting || cooldown > 0) return;
    const form = event.currentTarget;
    const nameValue = (
      form.elements.namedItem("Name") as HTMLInputElement | null
    )?.value.trim();
    const emailValue = (
      form.elements.namedItem("Email") as HTMLInputElement | null
    )?.value.trim();
    const passwordValue = (
      form.elements.namedItem("Password") as HTMLInputElement | null
    )?.value;
    const confirmValue = (
      form.elements.namedItem("Confirm password") as HTMLInputElement | null
    )?.value;
    if (!nameValue || !emailValue || !passwordValue) return;
    if (passwordValue !== confirmValue) {
      setError(PASSWORD_MISMATCH);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setNotice("");
    const { error: signUpError, alreadyRegistered } = await signUp(
      emailValue,
      passwordValue,
      { displayName: nameValue },
    );
    setIsSubmitting(false);
    setEmail(emailValue);
    if (signUpError) {
      setCooldown(SEND_COOLDOWN_SECONDS);
      setError(signUpError);
      return;
    }
    if (alreadyRegistered) {
      setError(ALREADY_REGISTERED);
      return;
    }
    setStep("otp");
    setNotice(`We sent a 6-digit code to ${emailValue}.`);
  };

  const handleVerify = async (code: string) => {
    if (isVerifying) return;
    setIsVerifying(true);
    setError(null);
    const { error: verifyError } = await verifySignupCode(email, code);
    setIsVerifying(false);
    if (verifyError) {
      setError(verifyError);
      return;
    }
    goToProjects();
  };

  const handleResend = async (): Promise<boolean> => {
    if (isResending) return false;
    setIsResending(true);
    setError(null);
    const { error: resendError } = await resendSignupCode(email);
    setIsResending(false);
    if (resendError) {
      setError(resendError);
      return false;
    }
    setNotice(`We sent a new code to ${email}.`);
    return true;
  };

  if (isLoading) {
    return (
      <AuthShell orbitWord="Begin.">
        <p role="status" className="text-sm text-ink-secondary">
          Checking your session…
        </p>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell orbitWord="Begin.">
        <p role="status" className="text-sm text-ink-secondary">
          You&apos;re already signed in — taking you to your projects…
        </p>
      </AuthShell>
    );
  }

  if (!isConfigured) {
    return (
      <AuthShell orbitWord="Begin.">
        <p role="status" className="max-w-sm text-sm text-ink-secondary">
          {CONFIG_NOTICE}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell orbitWord="Begin.">
      {step === "credentials" ? (
        <AnimatedForm
          header="Create your account"
          subHeader="Start monitoring your first project in minutes."
          fields={[
            {
              label: "Name",
              required: true,
              type: "text",
              placeholder: "Enter your full name",
              onChange: () => {},
            },
            {
              label: "Email",
              required: true,
              type: "email",
              placeholder: "Enter your email address",
              onChange: (event) => setEmail(event.target.value),
            },
            {
              label: "Password",
              required: true,
              type: "password",
              placeholder: "Create a password (min. 6 characters)",
              autoComplete: "new-password",
              onChange: () => {},
            },
            {
              label: "Confirm password",
              required: true,
              type: "password",
              placeholder: "Confirm your password",
              autoComplete: "new-password",
              onChange: () => {},
            },
          ]}
          submitButton={
            isSubmitting
              ? "Creating account…"
              : cooldown > 0
                ? `Try again in ${cooldown}s`
                : "Create account"
          }
          isSubmitting={isSubmitting || cooldown > 0}
          textVariantButton="Already have an account? Sign in"
          notice={notice || undefined}
          errorField={error ?? undefined}
          providerLabel="Continue with Google"
          providerIcon={<GoogleIcon />}
          onProviderClick={() => setNotice(OAUTH_NOTICE)}
          onSubmit={handleCredentialsSubmit}
          goTo={() => router.push("/login")}
        />
      ) : (
        <OtpVerifyForm
          email={email}
          isVerifying={isVerifying}
          isResending={isResending}
          error={error}
          notice={notice || null}
          onVerify={handleVerify}
          onResend={handleResend}
          onBack={() => {
            setStep("credentials");
            setError(null);
            setNotice("");
          }}
        />
      )}
    </AuthShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
