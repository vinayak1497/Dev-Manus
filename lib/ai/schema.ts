/**
 * Strict validation for AI output (acceptance §107 step 12).
 *
 * Model output is untrusted: we never render raw model JSON. Everything is
 * parsed and validated into the exact `IncidentAnalysis` shape here; on any
 * deviation the caller retries / falls back / shows an honest "unavailable"
 * state rather than surfacing malformed or invented content.
 *
 * Hand-rolled (no zod dependency) so the validator itself is dependency-free
 * and unit tested by the built-in `node --test` runner.
 */

import type {
  AnalysisEvidenceRef,
  IncidentAnalysis,
  SuggestedAction,
} from "./types";
import { isAllowedRemediation } from "../remediation/actions";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const RISKS = ["low", "medium", "high"] as const;
const CONFIDENCES = ["low", "medium", "high"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function parseEvidenceRef(v: unknown, i: number): ParseResult<AnalysisEvidenceRef> {
  if (!isRecord(v)) return { ok: false, error: `evidence[${i}] is not an object` };
  if (!nonEmptyString(v.source)) {
    return { ok: false, error: `evidence[${i}].source missing` };
  }
  if (!nonEmptyString(v.statement)) {
    return { ok: false, error: `evidence[${i}].statement missing` };
  }
  const timestamp =
    v.timestamp === null || v.timestamp === undefined
      ? null
      : typeof v.timestamp === "string"
        ? v.timestamp
        : undefined;
  if (timestamp === undefined) {
    return { ok: false, error: `evidence[${i}].timestamp must be string or null` };
  }
  return {
    ok: true,
    value: { source: v.source.trim(), statement: v.statement.trim(), timestamp },
  };
}

function parseAction(v: unknown, i: number): ParseResult<SuggestedAction> {
  if (!isRecord(v)) return { ok: false, error: `suggestedActions[${i}] not object` };
  if (!nonEmptyString(v.title)) {
    return { ok: false, error: `suggestedActions[${i}].title missing` };
  }
  if (!nonEmptyString(v.description)) {
    return { ok: false, error: `suggestedActions[${i}].description missing` };
  }
  if (!RISKS.includes(v.risk as (typeof RISKS)[number])) {
    return { ok: false, error: `suggestedActions[${i}].risk invalid` };
  }
  const action: SuggestedAction = {
    title: v.title.trim(),
    description: v.description.trim(),
    risk: v.risk as SuggestedAction["risk"],
  };
  // actionType is optional but, if present, MUST be on the allowlist — this is
  // the choke point that stops an arbitrary action string reaching the engine.
  if (v.actionType !== undefined && v.actionType !== null) {
    if (!isAllowedRemediation(v.actionType)) {
      return { ok: false, error: `suggestedActions[${i}].actionType not allowlisted` };
    }
    action.actionType = v.actionType;
  }
  return { ok: true, value: action };
}

/** Parse + validate an untrusted value into a strict IncidentAnalysis. */
export function parseIncidentAnalysis(input: unknown): ParseResult<IncidentAnalysis> {
  if (!isRecord(input)) return { ok: false, error: "analysis is not an object" };

  if (!nonEmptyString(input.observation)) {
    return { ok: false, error: "observation missing" };
  }
  if (!nonEmptyString(input.interpretation)) {
    return { ok: false, error: "interpretation missing" };
  }
  if (!CONFIDENCES.includes(input.confidence as (typeof CONFIDENCES)[number])) {
    return { ok: false, error: "confidence invalid" };
  }
  if (!Array.isArray(input.evidence)) {
    return { ok: false, error: "evidence is not an array" };
  }
  if (!Array.isArray(input.suggestedActions)) {
    return { ok: false, error: "suggestedActions is not an array" };
  }

  const evidence: AnalysisEvidenceRef[] = [];
  for (let i = 0; i < input.evidence.length; i++) {
    const r = parseEvidenceRef(input.evidence[i], i);
    if (!r.ok) return r;
    evidence.push(r.value);
  }

  const suggestedActions: SuggestedAction[] = [];
  for (let i = 0; i < input.suggestedActions.length; i++) {
    const r = parseAction(input.suggestedActions[i], i);
    if (!r.ok) return r;
    suggestedActions.push(r.value);
  }

  const insufficientEvidence = input.insufficientEvidence === true;

  return {
    ok: true,
    value: {
      observation: input.observation.trim(),
      interpretation: input.interpretation.trim(),
      confidence: input.confidence as IncidentAnalysis["confidence"],
      evidence,
      suggestedActions,
      insufficientEvidence,
    },
  };
}
