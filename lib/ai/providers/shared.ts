/**
 * Shared, server-only helpers for live AI providers.
 *
 * Every provider receives the same strict, anti-hallucination system prompt and
 * validates the model response through `parseIncidentAnalysis`. Keeping the
 * prompt and JSON extraction in one place means a new provider cannot quietly
 * weaken the evidence contract (§13).
 */

import { REMEDIATION_ACTION_TYPES } from "../../remediation/actions";

export const SYSTEM_PROMPT = [
  "You are an incident-analysis assistant for an SRE tool.",
  "You receive ONLY the structured evidence provided in the user message.",
  "Use only the supplied evidence. Do not invent logs, metrics, deployments, timestamps, services, or events.",
  "If the evidence is insufficient to determine a cause, set insufficientEvidence to true and say so plainly in interpretation.",
  "Correlation is not causation: never state that a deployment or change 'caused' the incident unless the evidence establishes it; prefer wording like 'occurred shortly before'.",
  "Respond with a SINGLE JSON object and nothing else (no prose, no code fences) matching exactly:",
  '{"observation":string,"evidence":[{"source":string,"timestamp":string|null,"statement":string}],"interpretation":string,"confidence":"low"|"medium"|"high","suggestedActions":[{"title":string,"description":string,"risk":"low"|"medium"|"high","actionType"?:string}],"insufficientEvidence":boolean}',
  `Every evidence[].statement must restate a supplied fact. actionType, when present, MUST be one of: ${REMEDIATION_ACTION_TYPES.join(", ")}.`,
].join(" ");

export function providerInputMessage(input: unknown): string {
  return `Incident evidence (JSON):\n${JSON.stringify(input)}`;
}

/** Pull the first JSON object out of a model response, tolerating fences. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object in model response");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/**
 * AI calls are made inside a request/worker path, so the configured timeout is
 * clamped to a bounded maximum. The shared 60s config is too long for a
 * serverless action even when a model is slow.
 */
export function readTimeoutMs(maxMs = 30_000): number {
  const seconds = readPositiveInt("AI_TIMEOUT_SECONDS", 20);
  return Math.min(maxMs, Math.max(5_000, seconds * 1000));
}

/** The output is a small JSON object; a huge configured token cap is wasteful. */
export function readMaxOutputTokens(maxTokens = 4096): number {
  return Math.min(maxTokens, readPositiveInt("AI_MAX_OUTPUT_TOKENS", 2048));
}

export function readTemperature(fallback = 0.2): number {
  const raw = process.env.AI_TEMPERATURE;
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : fallback;
}
