/**
 * Shared constructors for repository evidence.
 *
 * Every helper returns data only. Explanations name the file, field, and
 * semantic interpretation so the UI can show why Safeguard classified a port,
 * endpoint, dependency, or command the way it did.
 */
import type { Evidence, EvidenceConfidence } from "./types";

export function makeEvidence(input: {
  sourcePath: string;
  field?: string;
  line?: number;
  evidenceType: string;
  semanticRole?: string;
  confidence: EvidenceConfidence;
  explanation: string;
}): Evidence {
  return {
    sourcePath: input.sourcePath,
    ...(input.field === undefined ? {} : { field: input.field }),
    ...(input.line === undefined ? {} : { line: input.line }),
    evidenceType: input.evidenceType,
    ...(input.semanticRole === undefined ? {} : { semanticRole: input.semanticRole }),
    confidence: input.confidence,
    explanation: input.explanation,
  };
}

/** Render paths for the compact finding cards. */
export function evidencePaths(evidence: Evidence[] | undefined): string[] {
  if (!evidence) return [];
  const paths: string[] = [];
  for (const item of evidence) {
    if (!paths.includes(item.sourcePath)) paths.push(item.sourcePath);
  }
  return paths.slice(0, 4);
}
