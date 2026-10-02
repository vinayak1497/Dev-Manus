"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  toFriendlyAuthError,
  type AuthErrorReason,
} from "@/lib/supabase/auth-errors";

type AuthResult = { error: string | null; reason: AuthErrorReason | null };
type SignInResult = AuthResult & { unconfirmed: boolean };
type SignUpResult = AuthResult & { alreadyRegistered: boolean };

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  /** True while the initial session is being resolved. */
  isLoading: boolean;
  /** False when Supabase env keys are missing (pages show a config notice). */
  isConfigured: boolean;
  /** Email + password registration. Sends the 6-digit confirmation code. */
  signUp: (
    email: string,
    password: string,
    options?: { displayName?: string },
  ) => Promise<SignUpResult>;
  /** Email + password sign-in. Sends no email. */
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Verifies the signup confirmation code (type "signup"). */
  verifySignupCode: (email: string, token: string) => Promise<AuthResult>;
  /** Resends the signup confirmation code. */
  resendSignupCode: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

/**
 * Single application-level auth listener (SIGNED_IN / SIGNED_OUT /
 * TOKEN_REFRESHED / USER_UPDATED all flow through onAuthStateChange).
 * The Supabase client owns session persistence — nothing is stored manually.
 */
const AuthContext = createContext<AuthContextValue | null>(null);

function callbackUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}/auth/callback`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let client: SupabaseClient;
    try {
      client = createClient();
    } catch {
      setIsConfigured(false);
      setIsLoading(false);
      return;
    }
    setSupabase(client);

    let active = true;
    client.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsLoading(false);
      });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(
      (_event: AuthChangeEvent, nextSession: Session | null) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIsLoading(false);
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      options?: { displayName?: string },
    ): Promise<SignUpResult> => {
      if (!supabase) {
        return {
          error: "Authentication isn't configured yet.",
          reason: "unknown",
          alreadyRegistered: false,
        };
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl(),
          data: options?.displayName
            ? { display_name: options.displayName.trim() }
            : undefined,
        },
      });
      if (error) {
        const friendly = toFriendlyAuthError(
          error,
          "Couldn't create your account. Please try again.",
        );
        return {
          error: friendly?.message ?? null,
          reason: friendly?.reason ?? "unknown",
          alreadyRegistered: false,
        };
      }
      // Supabase returns an empty identities array (no error) when the
      // email is already registered — surface it honestly.
      if (data.user && data.user.identities?.length === 0) {
        return {
          error:
            "An account with this email already exists. Try signing in instead.",
          reason: "already_registered",
          alreadyRegistered: true,
        };
      }
      return { error: null, reason: null, alreadyRegistered: false };
    },
    [supabase],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (!supabase) {
        return {
          error: "Authentication isn't configured yet.",
          reason: "unknown",
          unconfirmed: false,
        };
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (!error) {
        return { error: null, reason: null, unconfirmed: false };
      }
      const unconfirmed = /email not confirmed/i.test(error.message ?? "");
      const friendly = toFriendlyAuthError(
        error,
        "Couldn't sign you in. Please try again.",
      );
      return {
        error: friendly?.message ?? null,
        reason: friendly?.reason ?? "unknown",
        unconfirmed,
      };
    },
    [supabase],
  );

  const verifySignupCode = useCallback(
    async (email: string, token: string): Promise<AuthResult> => {
      if (!supabase) {
        return {
          error: "Authentication isn't configured yet.",
          reason: "unknown",
        };
      }
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: "signup",
      });
      const friendly = toFriendlyAuthError(
        error,
        "Invalid or expired code. Please try again.",
      );
      return {
        error: friendly?.message ?? null,
        reason: friendly?.reason ?? "unknown",
      };
    },
    [supabase],
  );

  const resendSignupCode = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!supabase) {
        return {
          error: "Authentication isn't configured yet.",
          reason: "unknown",
        };
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl() },
      });
      const friendly = toFriendlyAuthError(
        error,
        "Couldn't resend the code. Please try again.",
      );
      return {
        error: friendly?.message ?? null,
        reason: friendly?.reason ?? "unknown",
      };
    },
    [supabase],
  );

  const signOut = useCallback(async (): Promise<AuthResult> => {
    if (!supabase) {
      return {
        error: "Authentication isn't configured yet.",
        reason: "unknown",
      };
    }
    const { error } = await supabase.auth.signOut();
    const friendly = toFriendlyAuthError(
      error,
      "Couldn't sign out. Please try again.",
    );
    return {
      error: friendly?.message ?? null,
      reason: friendly?.reason ?? "unknown",
    };
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isConfigured,
      signUp,
      signIn,
      verifySignupCode,
      resendSignupCode,
      signOut,
    }),
    [
      user,
      session,
      isLoading,
      isConfigured,
      signUp,
      signIn,
      verifySignupCode,
      resendSignupCode,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within <AuthProvider>.");
  }
  return context;
}
