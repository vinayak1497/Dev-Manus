/**
 * Maps Supabase Auth failures to user-friendly messages.
 * Never surfaces raw errors, tokens, or implementation details.
 */

type AuthFailure = {
  message?: string;
  code?: string;
  status?: number;
} | null;

/** Coarse bucket so the UI can react without parsing message text. */
export type AuthErrorReason =
  | "rate_limit"
  | "unconfirmed_email"
  | "invalid_credentials"
  | "invalid_code"
  | "already_registered"
  | "network"
  | "unknown";

export type FriendlyAuthError = {
  message: string;
  reason: AuthErrorReason;
};

const EMAIL_SEND_LIMIT =
  "Email sending is temporarily rate-limited on this project, so the code can't go out right now. Please try again in a few minutes.";

export function toFriendlyAuthError(
  failure: AuthFailure,
  fallback: string,
): FriendlyAuthError | null {
  if (!failure) return null;
  const message = failure.message ?? "";
  const code = failure.code ?? "";
  const status = failure.status;

  // Supabase's built-in mailer is heavily rate-limited on the free tier
  // (error_code: over_email_send_rate_limit). Distinguish it from a
  // generic request throttle so the UI can explain what to do.
  if (
    code === "over_email_send_rate_limit" ||
    /email rate limit exceeded|over_email_send_rate_limit/i.test(message)
  ) {
    return { message: EMAIL_SEND_LIMIT, reason: "rate_limit" };
  }
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_address_rate_limit" ||
    status === 429 ||
    /rate limit|too many requests|too many.*(email|otp)|over.*limit/i.test(
      message,
    )
  ) {
    return {
      message:
        "Too many requests. Please wait a minute before trying again.",
      reason: "rate_limit",
    };
  }
  if (/only request this after|try again in|after \d+ seconds/i.test(message)) {
    return {
      message: "Please wait a few seconds before requesting another code.",
      reason: "rate_limit",
    };
  }
  if (/invalid login credentials/i.test(message)) {
    return {
      message: "Incorrect email or password. Please try again.",
      reason: "invalid_credentials",
    };
  }
  if (/email not confirmed/i.test(message)) {
    return {
      message: "Please verify your email first — we sent you a 6-digit code.",
      reason: "unconfirmed_email",
    };
  }
  if (/user already registered|already been registered|already exists/i.test(message)) {
    return {
      message: "An account with this email already exists. Try signing in instead.",
      reason: "already_registered",
    };
  }
  if (/network|fetch failed|failed to fetch|econn|timeout/i.test(message)) {
    return {
      message: "Network error. Check your connection and try again.",
      reason: "network",
    };
  }
  if (
    /invalid.*(otp|token)|otp.*expir|expir.*(otp|token|code)|token.*(invalid|expired)|incorrect|wrong.*code|email.*(invalid|address)/i.test(
      message,
    )
  ) {
    return {
      message: "Invalid or expired code. Please try again.",
      reason: "invalid_code",
    };
  }
  if (/signup.*(disabled|not allowed)|new.*users.*disabled/i.test(message)) {
    return {
      message: "New accounts are currently disabled. Please contact support.",
      reason: "unknown",
    };
  }
  return { message: fallback, reason: "unknown" };
}
