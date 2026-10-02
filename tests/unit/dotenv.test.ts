/**
 * `.env` import tests — the parsing and conflict-safety contract for the
 * onboarding wizard's Import .env action (task scenarios 2–9, 11).
 *
 * These are the guarantees that matter most: a value containing "=" survives,
 * quotes are not stored, an existing value is never silently replaced, and no
 * parse issue ever carries file content.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyImportedValue,
  mergeEnvVars,
  parseEnvSource,
  summarizeImport,
} from "../../lib/onboarding/dotenv";
import type { EnvVar } from "../../lib/onboarding/types";

/** Convenience: parse then read the resulting key/value pairs. */
function pairs(source: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of parseEnvSource(source).vars) out[v.key] = v.value;
  return out;
}

test("scenario 2 — basic variables import verbatim", () => {
  const { vars, issues } = parseEnvSource(
    ["PORT=3000", "API_URL=https://example.com", "NODE_ENV=production"].join("\n"),
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(vars, [
    { key: "PORT", value: "3000" },
    { key: "API_URL", value: "https://example.com" },
    { key: "NODE_ENV", value: "production" },
  ]);
});

test("scenario 3 — quotes are interpreted, not stored", () => {
  const out = pairs(
    ['APP_NAME="My Application"', "DATABASE_URL='postgres://localhost/mydb'"].join("\n"),
  );
  assert.equal(out.APP_NAME, "My Application");
  assert.equal(out.DATABASE_URL, "postgres://localhost/mydb");
  for (const v of Object.values(out)) {
    assert.ok(!v.includes('"'), "double quotes must not survive");
    assert.ok(!v.includes("'"), "single quotes must not survive");
  }
});

test("scenario 4 — a value containing = is kept whole", () => {
  const out = pairs("TOKEN=abc=def=ghi");
  assert.equal(out.TOKEN, "abc=def=ghi");
  assert.equal(parseEnvSource("TOKEN=abc=def=ghi").vars.length, 1);
});

test("scenario 5 — comments and blank lines are ignored", () => {
  const { vars, issues } = parseEnvSource(
    [
      "# Application",
      "PORT=3000",
      "",
      "   ",
      "# Database",
      "DATABASE_URL=postgres://localhost/db",
      "   # indented comment",
    ].join("\n"),
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(vars, [
    { key: "PORT", value: "3000" },
    { key: "DATABASE_URL", value: "postgres://localhost/db" },
  ]);
});

test("scenario 6 — an empty value is a valid variable", () => {
  const { vars, issues } = parseEnvSource("OPTIONAL_VALUE=");
  assert.deepEqual(issues, []);
  assert.deepEqual(vars, [{ key: "OPTIONAL_VALUE", value: "" }]);
});

test("export prefix, whitespace, CRLF and BOM are all tolerated", () => {
  const out = pairs("\uFEFF  export API_KEY = abc123 \r\n\t SPACED\t=\tvalue \r\n");
  assert.equal(out.API_KEY, "abc123");
  assert.equal(out.SPACED, "value");
});

test("double-quoted escapes decode; single quotes stay literal", () => {
  const out = pairs(['A="line1\\nline2"', "B='raw\\nnot-a-newline'"].join("\n"));
  assert.equal(out.A, "line1\nline2");
  assert.equal(out.B, "raw\\nnot-a-newline");
});

test("an inline comment is stripped only after whitespace", () => {
  const out = pairs(["COLOR=blue # favourite", "TOKEN=abc#def"].join("\n"));
  assert.equal(out.COLOR, "blue");
  assert.equal(out.TOKEN, "abc#def");
});

test("scenario 8 — invalid entries are reported, never silently dropped", () => {
  const { vars, issues } = parseEnvSource(
    ["GOOD=1", "2BAD=nope", "lower_case=ok", "has space=1", "NOEQUALS"].join("\n"),
  );
  assert.deepEqual(vars, [
    { key: "GOOD", value: "1" },
    { key: "lower_case", value: "ok" },
  ]);
  assert.deepEqual(
    issues.map((i) => i.reason),
    ["invalid-name", "invalid-name", "missing-equals"],
  );
  assert.deepEqual(issues.map((i) => i.line), [2, 4, 5]);
});

test("a parse issue never carries file content or values", () => {
  const secret = "sk_live_do_not_leak_me";
  const { issues } = parseEnvSource([`API_KEY="${secret}`, "NOEQUALS"].join("\n"));
  assert.ok(issues.length > 0);
  const serialised = JSON.stringify(issues);
  assert.ok(
    !serialised.includes(secret),
    "issue payload must never embed a value from the file",
  );
});

test("a repeated name inside one file is reported as a duplicate", () => {
  const { vars, issues } = parseEnvSource(["A=1", "A=2"].join("\n"));
  assert.deepEqual(vars, [{ key: "A", value: "1" }]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].reason, "duplicate-in-file");
});

test("an unterminated quote is an issue, not a mangled value", () => {
  const { vars, issues } = parseEnvSource('BROKEN="never closed');
  assert.deepEqual(vars, []);
  assert.equal(issues[0].reason, "unterminated-quote");
});

test("scenario 9 — an empty file parses to nothing and raises nothing", () => {
  for (const empty of ["", "\n\n", "# only a comment\n", "   \n\t\n"]) {
    const { vars, issues } = parseEnvSource(empty);
    assert.deepEqual(vars, [], `expected no vars for ${JSON.stringify(empty)}`);
    assert.deepEqual(issues, []);
  }
});

test("scenario 7 — an existing value is never silently overwritten", () => {
  const existing: EnvVar[] = [{ key: "API_URL", value: "https://old.example.com" }];
  const merge = mergeEnvVars(existing, parseEnvSource("API_URL=https://new.example.com"));

  assert.deepEqual(merge.added, [], "conflicting key must not be appended");
  assert.equal(merge.conflicts.length, 1);
  assert.equal(merge.conflicts[0].key, "API_URL");
  assert.equal(merge.conflicts[0].existingValue, "https://old.example.com");
  assert.equal(merge.conflicts[0].importedValue, "https://new.example.com");
  // The editor still holds the user's original value.
  assert.equal(existing[0].value, "https://old.example.com");
});

test("scenario 11 — a second import adds new keys and flags the repeat", () => {
  const existing: EnvVar[] = [
    { key: "PORT", value: "3000" },
    { key: "API_URL", value: "https://api.example.com" },
  ];
  const merge = mergeEnvVars(
    existing,
    parseEnvSource("PORT=4000\nREDIS_URL=redis://localhost"),
  );

  assert.deepEqual(merge.added, [{ key: "REDIS_URL", value: "redis://localhost" }]);
  assert.equal(merge.conflicts.length, 1);
  assert.equal(merge.conflicts[0].key, "PORT");
  assert.equal(existing[0].value, "3000", "existing PORT preserved by default");
});

test("a conflict is matched case-insensitively and keeps the user's casing", () => {
  const existing: EnvVar[] = [{ key: "Api_Url", value: "keep-me" }];
  const merge = mergeEnvVars(existing, parseEnvSource("API_URL=replace-me"));
  assert.equal(merge.conflicts.length, 1);
  assert.equal(merge.conflicts[0].key, "Api_Url");
});

test("conflicts inside the incoming file itself do not produce duplicates", () => {
  const merge = mergeEnvVars([], parseEnvSource("A=1\nB=2"));
  assert.equal(merge.added.length, 2);
  assert.equal(merge.conflicts.length, 0);
});

test("applyImportedValue replaces only the chosen row, on explicit request", () => {
  const vars: EnvVar[] = [
    { key: "PORT", value: "3000" },
    { key: "API_URL", value: "https://old.example.com" },
  ];
  const next = applyImportedValue(vars, "API_URL", "https://new.example.com");
  assert.deepEqual(next, [
    { key: "PORT", value: "3000" },
    { key: "API_URL", value: "https://new.example.com" },
  ]);
  // Source array untouched.
  assert.equal(vars[1].value, "https://old.example.com");
});

test("summary stays concise across the three outcomes", () => {
  assert.equal(summarizeImport(1, 0, 0), "1 variable imported");
  assert.equal(summarizeImport(12, 0, 0), "12 variables imported");
  assert.equal(summarizeImport(12, 2, 0), "12 variables imported · 2 conflicts");
  assert.equal(summarizeImport(10, 0, 2), "10 variables imported · 2 skipped");
  assert.equal(
    summarizeImport(8, 1, 2),
    "8 variables imported · 1 conflict · 2 skipped",
  );
});

test("variable interpolation is left literal rather than guessed", () => {
  const out = pairs("BASE=https://api.example.com\nAPI=${BASE}/v1");
  assert.equal(out.API, "${BASE}/v1");
});

test("a large file imports completely", () => {
  const source = Array.from({ length: 250 }, (_, i) => `VAR_${i}=value-${i}`).join("\n");
  const { vars, issues } = parseEnvSource(source);
  assert.equal(issues.length, 0);
  assert.equal(vars.length, 250);
  assert.equal(vars[249].value, "value-249");
});