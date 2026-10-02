/**
 * Small helpers for reading deployment manifests as data.
 *
 * Repository files are untrusted input. These helpers parse configuration
 * without executing it, normalize only shapes the analyzer understands, and
 * never return secret values as findings (callers must select key names, not
 * secret payloads).
 */
import { parseYamlDocuments, type YamlValue } from "./yaml";

export type { YamlValue };

export type ManifestDocument = {
  value: YamlValue;
  raw: string;
};

export function isYamlPath(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}

export function isJsonPath(path: string): boolean {
  return /\.json$/i.test(path);
}

/** Parse every document in a manifest; malformed documents are omitted. */
export function parseManifestDocuments(path: string, text: string): ManifestDocument[] {
  if (isJsonPath(path)) {
    try {
      return [{ value: JSON.parse(text) as YamlValue, raw: text }];
    } catch {
      return [];
    }
  }
  if (!isYamlPath(path)) return [];
  return parseYamlDocuments(text)
    .filter((doc) => doc.error === null)
    .map((doc) => ({ value: doc.value, raw: text }));
}

export function asRecord(value: unknown): Record<string, YamlValue> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, YamlValue>)
    : null;
}

export function asList(value: unknown): YamlValue[] {
  return Array.isArray(value) ? (value as YamlValue[]) : [];
}

export function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text === "" ? null : text;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return null;
}

export function asInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 65536) {
    return value;
  }
  if (typeof value === "string") {
    const text = value.trim().replace(/^["']|["']$/g, "");
    if (/^\d{1,5}$/.test(text)) {
      const n = Number.parseInt(text, 10);
      if (n > 0 && n < 65536) return n;
    }
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true") return true;
    if (text === "false") return false;
  }
  return null;
}

/** Read a nested mapping path such as `["spec", "ports"]`. */
export function getPath(value: unknown, path: string[]): YamlValue | undefined {
  let current: unknown = value;
  for (const segment of path) {
    const record = asRecord(current);
    if (!record || !(segment in record)) return undefined;
    current = record[segment];
  }
  return current as YamlValue | undefined;
}

/** First 1-based line matching a pattern, when the source is available. */
export function lineOf(text: string, pattern: RegExp): number | undefined {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return i + 1;
  }
  return undefined;
}

/** Split a shell-form command without expanding variables or executing it. */
export function splitShellWords(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;
  const push = () => {
    if (current !== "") out.push(current);
    current = "";
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      continue;
    }
    current += ch;
  }
  push();
  return out;
}

/** Render command tokens for display using POSIX shell quoting. */
export function quoteShell(words: string[]): string {
  return words
    .map((word) => {
      if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) return word;
      return `'${word.replace(/'/g, `'\\''`)}'`;
    })
    .join(" ");
}
