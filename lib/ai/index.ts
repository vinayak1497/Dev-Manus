/**
 * Provider selection + fallback chain (acceptance §107 step 11).
 *
 * Order: a real provider when its credentials exist, then the deterministic
 * provider as a guaranteed, honest fallback. On a primary failure we log the
 * provider name and error TYPE only — never the API key, prompt, or evidence —
 * and fall through. Because the deterministic provider cannot fail, callers
 * always receive a valid, validated analysis (or an honest "insufficient
 * evidence" one); result semantics never silently change.
 */

import type { AIProvider, IncidentAnalysis, IncidentAnalysisInput } from "./types";
import { DeterministicProvider } from "./providers/deterministic";
import { AnthropicProvider } from "./providers/anthropic";

export type AnalysisResult = {
  analysis: IncidentAnalysis;
  /** Which provider actually produced the result (for honest labelling). */
  provider: string;
  /** True when a configured primary failed and we used the fallback. */
  usedFallback: boolean;
};

/** Ordered provider chain: real provider(s) first, deterministic last. */
export function buildProviderChain(): AIProvider[] {
  const chain: AIProvider[] = [];
  const anthropic = AnthropicProvider.fromEnv();
  if (anthropic) chain.push(anthropic);
  chain.push(new DeterministicProvider());
  return chain;
}

/** Names of the providers that will be attempted, for UI display. */
export function configuredProviderNames(): string[] {
  return buildProviderChain().map((p) => p.name);
}

function safeErrorLabel(err: unknown): string {
  if (err instanceof Error) return err.name || "Error";
  return "UnknownError";
}

export async function analyzeIncident(
  input: IncidentAnalysisInput,
  chain: AIProvider[] = buildProviderChain(),
): Promise<AnalysisResult> {
  let usedFallback = false;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i];
    try {
      const analysis = await provider.analyzeIncident(input);
      return { analysis, provider: provider.name, usedFallback };
    } catch (err) {
      // Safe log: provider + error type only. No key, prompt, or evidence.
      console.warn(
        `[ai] provider "${provider.name}" failed (${safeErrorLabel(err)}); ` +
          (i < chain.length - 1 ? "falling back" : "no fallback left"),
      );
      usedFallback = true;
    }
  }
  // Unreachable in practice: DeterministicProvider never throws.
  throw new Error("no AI provider produced a result");
}
