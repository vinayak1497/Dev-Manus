/**
 * `.env` (dotenv) parsing for the onboarding wizard — pure functions, no I/O.
 *
 * Why a local parser instead of the `dotenv` package: `dotenv` is not in this
 * project's dependency tree, and its main entry pulls in `node:fs`, which has
 * no meaning in a client component. The surface needed here is small and fully
 * specified by the onboarding contract, so it is implemented as one pure,
 * unit-tested module (`tests/unit/dotenv.test.ts`) rather than shipping a
 * Node-only dependency into the browser bundle.
 *
 * Security (RULE.md §10, §24):
 * - Parsing happens entirely in memory on the client. Nothing is uploaded,
 *   logged, or sent anywhere. There is no telemetry call in this module.
 * - `ParseIssue` deliberately carries NO raw source text and NO value. A
 *   `.env` file routinely holds credentials, so an error must be able to
 *   explain itself without ever echoing the content it rejected.
 *
 * Deliberately NOT implemented (would be guesswork, see RULE.md §29):
 * variable expansion/interpolation (`$VAR`), because resolving it safely
 * needs an explicit precedence rule the product has not defined. `${FOO}` is
 * therefore preserved literally.
 */
import { isValidEnvVarKey } from "./validation";
import type { EnvVar } from "./types";

export type ParseIssueReason =
  | "invalid-name"
  | "missing-equals"
  | "unterminated-quote"
  | "duplicate-in-file";

export type ParseIssue = {
  /** 1-based line number in the source file. */
  line: number;
  /**
   * The offending variable name when the line had a usable one. Names are not
   * secrets, so this is safe to show; values are never included.
   */
  key: string | null;
  reason: ParseIssueReason;
};

export type ParsedEnv = {
  vars: EnvVar[];
  issues: ParseIssue[];
};

export const ISSUE_MESSAGE: Record<ParseIssueReason, string> = {
  "invalid-name": "Names may only use A–Z, 0–9, and underscores, and cannot start with a digit.",
  "missing-equals": "This line has no “=” separator, so it isn't a variable.",
  "unterminated-quote": "A quoted value is never closed on the same line.",
  "duplicate-in-file": "This name appears more than once in the file.",
};

/** `export API_KEY=abc` → `API_KEY=abc`. */
function stripExport(line: string): string {
  const m = /^export\s+(?=\S)/.exec(line);
  return m ? line.slice(m[0].length) : line;
}

/** Unescape only what double quotes can legally produce. */
function unescape(raw: string): string {
  return raw.replace(/\\(n|r|t|f|v|0|\\|"|'|`|\$)/g, (_m, c: string) => {
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return c;
    }
  });
}

/**
 * Resolve the value side of a line.
 * Returns `null` when a quote is opened and never closed.
 */
function readValue(raw: string): string | null {
  const v = raw.trim();
  if (v === "") return "";

  if (v.startsWith('"') || v.startsWith("'")) {
    const quote = v[0];
    // Must be the final character; otherwise the value is not terminated.
    if (v.length < 2 || v[v.length - 1] !== quote) return null;
    const inner = v.slice(1, -1);
    return quote === '"' ? unescape(inner) : inner;
  }

  // Unquoted: an inline comment must be preceded by whitespace, so values
  // such as `TOKEN=abc#def` keep their `#`.
  const hash = v.search(/\s#/);
  return (hash === -1 ? v : v.slice(0, hash)).trim();
}

/**
 * Parse dotenv source text.
 *
 * Handles: `KEY=value`, single/double quotes (stripped, double quotes
 * unescaped), `=` inside values, empty values, `#` comments, blank lines,
 * `export` prefixes, surrounding whitespace, and BOMs.
 */
export function parseEnvSource(source: string): ParsedEnv {
  const vars: EnvVar[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Set<string>();
  const text = source.replace(/^\uFEFF/, "");

  const lines = text.split(/\r\n|\r|\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const trimmed = lines[i].trim();

    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const body = stripExport(trimmed);
    const eq = body.indexOf("=");

    if (eq === -1) {
      issues.push({ line: lineNumber, key: null, reason: "missing-equals" });
      continue;
    }

    const key = body.slice(0, eq).trim();
    if (!isValidEnvVarKey(key)) {
      issues.push({
        line: lineNumber,
        key: key === "" ? null : key.slice(0, 60),
        reason: "invalid-name",
      });
      continue;
    }

    const value = readValue(body.slice(eq + 1));
    if (value === null) {
      issues.push({ line: lineNumber, key, reason: "unterminated-quote" });
      continue;
    }

    if (seen.has(key)) {
      issues.push({ line: lineNumber, key, reason: "duplicate-in-file" });
      continue;
    }

    seen.add(key);
    vars.push({ key, value });
  }

  return { vars, issues };
}

export type EnvConflict = {
  key: string;
  /** The value the user already has. Never rendered in full by the UI. */
  existingValue: string;
  importedValue: string;
};

export type EnvMerge = {
  /** Rows to append to the editor. Conflicts are never in here. */
  added: EnvVar[];
  /** Existing keys the file also defines. Existing values are preserved. */
  conflicts: EnvConflict[];
  issues: ParseIssue[];
};

/**
 * Merge parsed entries into the editor, never overwriting silently.
 *
 * A key already present in `existing` becomes a `conflict` and its current
 * value is left untouched — the caller must ask the user before replacing it
 * (RULE.md §9: never silently destroy user-entered data).
 */
export function mergeEnvVars(existing: EnvVar[], parsed: ParsedEnv): EnvMerge {
  const existingKeys = new Set(
    existing.map((v) => v.key.trim().toUpperCase()).filter(Boolean),
  );

  const added: EnvVar[] = [];
  const conflicts: EnvConflict[] = [];

  for (const incoming of parsed.vars) {
    const normalized = incoming.key.trim().toUpperCase();
    if (existingKeys.has(normalized)) {
      const match = existing.find(
        (v) => v.key.trim().toUpperCase() === normalized,
      );
      conflicts.push({
        key: match ? match.key : incoming.key,
        existingValue: match ? match.value : "",
        importedValue: incoming.value,
      });
      continue;
    }
    existingKeys.add(normalized);
    added.push(incoming);
  }

  return { added, conflicts, issues: parsed.issues };
}

/**
 * Replace the value of an existing row. Used only after the user explicitly
 * chooses "use imported" for a conflict.
 */
export function applyImportedValue(
  vars: EnvVar[],
  key: string,
  importedValue: string,
): EnvVar[] {
  const normalized = key.trim().toUpperCase();
  return vars.map((v) =>
    v.key.trim().toUpperCase() === normalized ? { ...v, value: importedValue } : v,
  );
}

/** One-line summary, e.g. "3 variables imported · 1 conflict · 2 skipped". */
export function summarizeImport(
  addedCount: number,
  conflictCount: number,
  issueCount: number,
): string {
  const parts: string[] = [];
  parts.push(
    addedCount === 1 ? "1 variable imported" : `${addedCount} variables imported`,
  );
  if (conflictCount > 0) {
    parts.push(`${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`);
  }
  if (issueCount > 0) {
    parts.push(`${issueCount} skipped`);
  }
  return parts.join(" · ");
}