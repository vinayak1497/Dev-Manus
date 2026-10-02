"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatedForm } from "@/components/ui/auth";
import { AuthShell, GoogleIcon } from "@/components/auth/AuthShell";
import { OtpVerifyForm } from "@/components/auth/OtpVerifyForm";
import { useAuth } from "@/components/auth/AuthProvider";
import { PROJECTS_HREF } from "@/lib/site";

const OAUTH_NOTICE =
  "Continue with Google isn't configured yet — please sign in with email and password.";
const CONFIG_NOTICE =
  "Authentication isn't configured yet. Add the Supabase keys to .env.local (see Docs/Auth-Resend-SMTP.md).";

/** Internal paths only — never redirect to external URLs from ?next=. */
function sanitizeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return PROJECTS_HREF;
}

type Step = "credentials" | "otp";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNext(searchParams.get("next"));
  const { user, isLoading, isConfigured, signIn, verifySignupCode, resendSignupCode } =
    useAuth();

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

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
    if (isSubmitting) return;
    const form = event.currentTarget;
    const emailValue = (
      form.elements.namedItem("Email") as HTMLInputElement | null
    )?.value.trim();
    const passwordValue = (
      form.elements.namedItem("Password") as HTMLInputElement | null
    )?.value;
    if (!emailValue || !passwordValue) return;
    setIsSubmitting(true);
    setError(null);
    setNotice("");
    const { error: signInError, unconfirmed } = await signIn(
      emailValue,
      passwordValue,
    );
    if (!signInError) {
      setIsSubmitting(false);
      goToProjects();
      return;
    }
    // Account exists but email isn't verified yet — move to the code
    // step and send a fresh confirmation code.
    if (unconfirmed) {
      const { error: resendError } = await resendSignupCode(emailValue);
      setIsSubmitting(false);
      setEmail(emailValue);
      setStep("otp");
      setNotice(resendError ?? `We sent a 6-digit code to ${emailValue}.`);
      if (resendError) setError(resendError);
      return;
    }
    setIsSubmitting(false);
    setEmail(emailValue);
    setError(signInError);
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
      <AuthShell orbitWord="Welcome.">
        <p role="status" className="text-sm text-ink-secondary">
          Checking your session…
        </p>
      </AuthShell>
    );
  }

  if (user) {
    return (
      <AuthShell orbitWord="Welcome.">
        <p role="status" className="text-sm text-ink-secondary">
          You&apos;re already signed in — taking you to your projects…
        </p>
      </AuthShell>
    );
  }

  if (!isConfigured) {
    return (
      <AuthShell orbitWord="Welcome.">
        <p role="status" className="max-w-sm text-sm text-ink-secondary">
          {CONFIG_NOTICE}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell orbitWord="Welcome.">
      {step === "credentials" ? (
        <AnimatedForm
          header="Welcome back"
          subHeader="Sign in to your DevOps Safeguard account."
          fields={[
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
              placeholder: "Enter your password",
              onChange: () => {},
            },
          ]}
          submitButton={isSubmitting ? "Signing in…" : "Sign in"}
          isSubmitting={isSubmitting}
          textVariantButton="New to Safeguard? Create an account"
          notice={notice || undefined}
          errorField={error ?? undefined}
          providerLabel="Continue with Google"
          providerIcon={<GoogleIcon />}
          onProviderClick={() => setNotice(OAUTH_NOTICE)}
          onSubmit={handleCredentialsSubmit}
          goTo={() => router.push("/register")}
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
