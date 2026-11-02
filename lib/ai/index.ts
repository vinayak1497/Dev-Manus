/**
 * Provider selection + fallback chain (acceptance §107 step 11).
 *
 * Order: the operators' configured primary provider, their fallbacks, any
 * other provider whose key is present, then the deterministic provider as a
 * guaranteed, honest fallback. On a primary failure we log the provider name
 * and error TYPE only — never the API key, prompt, or evidence — and fall
 * through. Because the deterministic provider cannot fail, callers always
 * receive a valid, validated analysis (or an honest "insufficient evidence"
 * one); result semantics never silently change.
 *
 * Keys are read only on the server. Nothing here is imported by a client
 * component, and provider names/models are the only metadata ever returned.
 */

import type { AIProvider, IncidentAnalysis, IncidentAnalysisInput } from "./types";
import { DeterministicProvider } from "./providers/deterministic";
import { AnthropicProvider } from "./providers/anthropic";
import { GoogleGeminiProvider } from "./providers/google";
import { OpenAICompatibleProvider } from "./providers/openai";

export type AnalysisResult = {
  analysis: IncidentAnalysis;
  /** Which provider actually produced the result (for honest labelling). */
  provider: string;
  /** Model identifier when the provider uses one. */
  model?: string;
  /** True when a configured primary failed and we used the fallback. */
  usedFallback: boolean;
};

type ProviderKey = "google" | "openai" | "deepseek" | "anthropic";

const DEFAULT_ORDER: readonly ProviderKey[] = [
  "google",
  "openai",
  "deepseek",
  "anthropic",
];

function isAiEnabled(): boolean {
  const value = process.env.AI_ENABLED?.trim().toLowerCase();
  return value !== "false" && value !== "0" && value !== "off";
}

function providerFromEnv(key: ProviderKey): AIProvider | null {
  switch (key) {
    case "google":
      return GoogleGeminiProvider.fromEnv();
    case "openai":
      return OpenAICompatibleProvider.fromEnv("openai");
    case "deepseek":
      return OpenAICompatibleProvider.fromEnv("deepseek");
    case "anthropic":
      return AnthropicProvider.fromEnv();
    default:
      return null;
  }
}

function configuredOrder(): ProviderKey[] {
  const primary = (process.env.AI_PRIMARY_PROVIDER ?? "").trim().toLowerCase();
  const fallbacks = (process.env.AI_FALLBACK_PROVIDERS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const requested = [primary, ...fallbacks].filter(
    (value): value is ProviderKey =>
      DEFAULT_ORDER.includes(value as ProviderKey),
  );

  // Always give any other provider with a usable key a chance after the
  // explicitly configured ones. This preserves the previous Anthropic-only
  // deployments while allowing Google/OpenAI/DeepSeek to be introduced without
  // a config change.
  return [...requested, ...DEFAULT_ORDER].filter(
    (value, index, all) => all.indexOf(value) === index,
  );
}

/** Ordered provider chain: real provider(s) first, deterministic last. */
export function buildProviderChain(): AIProvider[] {
  if (!isAiEnabled()) return [new DeterministicProvider()];

  const chain: AIProvider[] = [];
  const seen = new Set<string>();
  for (const key of configuredOrder()) {
    const provider = providerFromEnv(key);
    if (!provider || seen.has(provider.name)) continue;
    seen.add(provider.name);
    chain.push(provider);
  }
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
      return {
        analysis,
        provider: provider.name,
        ...(provider.model ? { model: provider.model } : {}),
        usedFallback,
      };
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
