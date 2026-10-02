/**
 * Static Helm analysis without rendering charts.
 *
 * Helm templates are Go templates, not YAML. Executing them against
 * repository content would mean running repository-controlled logic, which
 * the security rules forbid. This module instead:
 *
 * - parses `values.yaml` as data;
 * - evaluates only simple `if` conditions against those default values;
 * - substitutes only simple `.Values...` expressions with their defaults;
 * - blanks every other template action while preserving line numbers.
 *
 * Unsupported template logic is omitted rather than guessed. A disabled
 * conditional block is therefore never mistaken for active configuration.
 */
import { asBoolean, asRecord, getPath, type YamlValue } from "./manifests";
import { parseYamlDocuments } from "./yaml";

export type HelmDependency = {
  name: string;
  alias: string | null;
  repository: string | null;
  conditionPaths: string[][];
  tags: string[];
};

export type HelmChart = {
  root: string;
  valuesPath: string | null;
  values: YamlValue | null;
  valuesError: boolean;
  dependencies: HelmDependency[];
};

type ExpressionResult = {
  supported: boolean;
  value?: YamlValue;
};

function chartRootForTemplate(path: string): string | null {
  const marker = "/templates/";
  const index = path.lastIndexOf(marker);
  if (index <= 0) return null;
  return path.slice(0, index);
}

function splitValuePath(path: string): string[] {
  return path.split(".").filter((segment) => segment !== "");
}

function lookupValue(values: YamlValue | null | undefined, path: string[]): YamlValue | undefined {
  if (!path.length) return undefined;
  if (path[0] !== "Values") return undefined;
  return getPath(values ?? null, path.slice(1));
}

function helmTruth(value: YamlValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

function scalarEquals(a: YamlValue | undefined, b: YamlValue | undefined): boolean {
  if (typeof a === "number" && typeof b === "string" && b.trim() !== "" && !Number.isNaN(Number(b))) {
    return a === Number(b);
  }
  if (typeof b === "number" && typeof a === "string" && a.trim() !== "" && !Number.isNaN(Number(a))) {
    return Number(a) === b;
  }
  return a === b;
}

type Token =
  | { kind: "paren"; value: "(" | ")" }
  | { kind: "pipe"; value: "|" }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "nil"; value: null }
  | { kind: "ident"; value: string };

function tokenize(expression: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expression.length) {
    const ch = expression[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ kind: "paren", value: ch });
      i += 1;
      continue;
    }
    if (ch === "|") {
      tokens.push({ kind: "pipe", value: "|" });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let out = "";
      i += 1;
      while (i < expression.length && expression[i] !== quote) {
        if (quote === '"' && expression[i] === "\\" && i + 1 < expression.length) {
          const next = expression[i + 1];
          out += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
          continue;
        }
        if (quote === "'" && expression[i] === "'" && expression[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        out += expression[i];
        i += 1;
      }
      if (i >= expression.length) return null;
      i += 1;
      tokens.push({ kind: "string", value: out });
      continue;
    }
    if (/[0-9]/.test(ch) || ((ch === "-" || ch === "+") && /[0-9]/.test(expression[i + 1] ?? ""))) {
      const m = /^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/.exec(expression.slice(i));
      if (!m) return null;
      tokens.push({ kind: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$.]/.test(ch)) {
      let j = i;
      while (j < expression.length && /[A-Za-z0-9_$.]/.test(expression[j] ?? "")) j += 1;
      const word = expression.slice(i, j);
      if (word === "true" || word === "false") tokens.push({ kind: "bool", value: word === "true" });
      else if (word === "nil" || word === "null" || word === "none") tokens.push({ kind: "nil", value: null });
      else tokens.push({ kind: "ident", value: word });
      i = j;
      continue;
    }
    return null;
  }
  return tokens;
}

class ExpressionEvaluator {
  private tokens: Token[];
  private index = 0;
  private values: YamlValue | null;

  constructor(expression: string, values: YamlValue | null) {
    this.tokens = tokenize(expression) ?? [];
    this.values = values;
    if (this.tokens.length === 0) throw new Error("empty expression");
  }

  evaluate(): ExpressionResult {
    const value = this.parseOr();
    if (this.index !== this.tokens.length) throw new Error("trailing expression input");
    return { supported: true, value: value ?? null };
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    this.index += 1;
    if (!token) throw new Error("unexpected end of expression");
    return token;
  }

  private parseOr(): YamlValue | undefined {
    let left = this.parseAnd();
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "ident" || token.value !== "or") return left;
      this.next();
      const right = this.parseAnd();
      left = helmTruth(left) || helmTruth(right);
    }
  }

  private parseAnd(): YamlValue | undefined {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "ident" || token.value !== "and") return left;
      this.next();
      const right = this.parseUnary();
      left = helmTruth(left) && helmTruth(right) ? right : false;
    }
  }

  private parseUnary(): YamlValue | undefined {
    const token = this.peek();
    if (token?.kind === "ident" && token.value === "not") {
      this.next();
      return !helmTruth(this.parseUnary());
    }
    return this.parseComparison();
  }

  private parseComparison(): YamlValue | undefined {
    const left = this.parsePipeline();
    const token = this.peek();
    if (token?.kind === "ident" && ["eq", "ne", "lt", "le", "gt", "ge"].includes(token.value)) {
      this.next();
      const right = this.parsePipeline();
      switch (token.value) {
        case "eq":
          return scalarEquals(left, right);
        case "ne":
          return !scalarEquals(left, right);
        case "lt":
          return compareValues(left, right) < 0;
        case "le":
          return compareValues(left, right) <= 0;
        case "gt":
          return compareValues(left, right) > 0;
        default:
          return compareValues(left, right) >= 0;
      }
    }
    return left;
  }

  private parsePipeline(): YamlValue | undefined {
    let value = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token?.kind !== "pipe") return value;
      this.next();
      const name = this.next();
      if (name.kind !== "ident") throw new Error("pipeline needs a function");
      const args: (YamlValue | undefined)[] = [];
      for (;;) {
        const next = this.peek();
        if (!next || next.kind === "pipe" || (next.kind === "paren" && next.value === ")")) break;
        if (next.kind === "ident" && ["and", "or", "eq", "ne", "lt", "le", "gt", "ge"].includes(next.value)) break;
        args.push(this.parsePrimary());
      }
      value = applyFunction(name.value, value, args, true);
    }
  }

  private parsePrimary(): YamlValue | undefined {
    const token = this.next();
    if (token.kind === "paren" && token.value === "(") {
      const value = this.parseOr();
      const close = this.next();
      if (close.kind !== "paren" || close.value !== ")") throw new Error("unbalanced parenthesis");
      return value;
    }
    if (token.kind === "string" || token.kind === "number" || token.kind === "bool" || token.kind === "nil") {
      return token.value;
    }
    if (token.kind === "ident") {
      if (token.value.startsWith(".")) return lookupValue(this.values, splitValuePath(token.value.slice(1)));
      if (["default", "empty", "not", "quote", "toString", "int", "trimSuffix", "trimPrefix", "required"].includes(token.value)) {
        const args: (YamlValue | undefined)[] = [];
        for (;;) {
          const next = this.peek();
          if (!next || next.kind === "pipe" || (next.kind === "paren" && next.value === ")")) break;
          if (next.kind === "ident" && ["and", "or", "eq", "ne", "lt", "le", "gt", "ge"].includes(next.value)) break;
          args.push(this.parsePrimary());
        }
        return applyFunction(token.value, undefined, args, false);
      }
      throw new Error(`unsupported identifier ${token.value}`);
    }
    throw new Error("unsupported expression");
  }
}

function compareValues(a: YamlValue | undefined, b: YamlValue | undefined): number {
  const aNumber = typeof a === "number" ? a : typeof a === "string" && a.trim() !== "" && !Number.isNaN(Number(a)) ? Number(a) : null;
  const bNumber = typeof b === "number" ? b : typeof b === "string" && b.trim() !== "" && !Number.isNaN(Number(b)) ? Number(b) : null;
  if (aNumber !== null && bNumber !== null) return aNumber < bNumber ? -1 : aNumber > bNumber ? 1 : 0;
  const aText = typeof a === "string" ? a : "";
  const bText = typeof b === "string" ? b : "";
  return aText < bText ? -1 : aText > bText ? 1 : 0;
}

function applyFunction(
  name: string,
  piped: YamlValue | undefined,
  args: (YamlValue | undefined)[],
  fromPipe: boolean,
): YamlValue | undefined {
  if (name === "default") {
    // Helm's argument order is `default DEFAULT GIVEN`; in a pipeline the
    // piped value arrives as GIVEN.
    const fallback = fromPipe ? args[0] : args[0];
    const given = fromPipe ? piped : args[1];
    if (given === undefined || given === null) return fallback ?? null;
    if (typeof given === "string" && given === "") return fallback ?? null;
    if (Array.isArray(given) && given.length === 0) return fallback ?? null;
    if (typeof given === "object" && !Array.isArray(given) && Object.keys(given).length === 0) return fallback ?? null;
    return given;
  }
  if (name === "empty") return !helmTruth(args[0] ?? piped);
  if (name === "not") return !helmTruth(args[0] ?? piped);
  if (name === "quote" || name === "toString") {
    const value = args[0] ?? piped;
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (value === null || value === undefined) return "";
    return JSON.stringify(value);
  }
  if (name === "int") {
    const value = args[0] ?? piped;
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (!Number.isInteger(n)) throw new Error("int needs an integer");
    return n;
  }
  if (name === "trimSuffix" || name === "trimPrefix") {
    const suffix = fromPipe ? args[0] : args[0];
    const text = fromPipe ? piped : args[1];
    if (typeof suffix !== "string" || typeof text !== "string") throw new Error(`${name} needs strings`);
    if (suffix === "") return text;
    if (name === "trimSuffix") return text.endsWith(suffix) ? text.slice(0, -suffix.length) : text;
    return text.startsWith(suffix) ? text.slice(suffix.length) : text;
  }
  throw new Error(`unsupported function ${name}`);
}

export function resolveHelmExpression(expression: string, values: YamlValue | null): ExpressionResult {
  try {
    return new ExpressionEvaluator(expression, values).evaluate();
  } catch {
    return { supported: false };
  }
}

export function evaluateHelmCondition(condition: string, values: YamlValue | null): boolean | null {
  const result = resolveHelmExpression(condition, values);
  if (!result.supported) return null;
  return helmTruth(result.value);
}

export function parseChartDependencies(text: string): HelmDependency[] {
  const docs = parseYamlDocuments(text);
  const out: HelmDependency[] = [];
  for (const doc of docs) {
    if (doc.error) continue;
    const root = asRecord(doc.value);
    const entries = root ? root.dependencies : undefined;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const record = asRecord(entry);
      if (!record) continue;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!name) continue;
      const alias = typeof record.alias === "string" && record.alias.trim() !== "" ? record.alias.trim() : null;
      const repository = typeof record.repository === "string" ? record.repository : null;
      const conditionPaths: string[][] = [];
      const condition = record.condition;
      const conditions = Array.isArray(condition) ? condition : typeof condition === "string" ? [condition] : [];
      for (const item of conditions) {
        if (typeof item === "string" && item.trim() !== "") conditionPaths.push(splitValuePath(item.trim()));
      }
      const tags = Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map((tag) => tag.trim())
        : [];
      out.push({ name, alias, repository, conditionPaths, tags });
    }
  }
  return out;
}

export function loadHelmChart(files: Record<string, string | null>, templatePath: string): HelmChart | null {
  const root = chartRootForTemplate(templatePath);
  if (!root) return null;
  const valuesPath = [`${root}/values.yaml`, `${root}/values.yml`].find((path) => typeof files[path] === "string") ?? null;
  const valuesText = valuesPath ? files[valuesPath] : null;
  let values: YamlValue | null = null;
  let valuesError = false;
  if (typeof valuesText === "string") {
    const docs = parseYamlDocuments(valuesText);
    if (docs.length > 0 && docs[0].error === null) {
      values = docs[0].value;
    } else {
      valuesError = true;
    }
  }
  const dependencies: HelmDependency[] = [];
  for (const name of [`${root}/Chart.yaml`, `${root}/Chart.yml`, `${root}/requirements.yaml`]) {
    const text = files[name];
    if (typeof text === "string") dependencies.push(...parseChartDependencies(text));
  }
  return { root, valuesPath, values, valuesError, dependencies };
}

type ConditionalFrame = {
  parentActive: boolean;
  taken: boolean;
  active: boolean;
};

function findExpressionEnd(line: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = start + 2; i < line.length - 1; i += 1) {
    const ch = line[i];
    if (quote !== null) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "}" && line[i + 1] === "}") return i;
  }
  return -1;
}

function yamlLiteral(value: YamlValue | undefined): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "string" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function substituteInlineExpressions(line: string, values: YamlValue | null): string {
  let out = "";
  let index = 0;
  for (;;) {
    const start = line.indexOf("{{", index);
    if (start === -1) {
      out += line.slice(index);
      return out;
    }
    const end = findExpressionEnd(line, start);
    if (end === -1) return `${out}${line.slice(index, start)}"__safeguard_unsupported__"`;
    const result = resolveHelmExpression(line.slice(start + 2, end).trim(), values);
    const before = line.slice(index, start);
    const after = line.slice(end + 2);
    // A standalone expression is the whole scalar and needs YAML quoting when
    // unsafe. An embedded expression is part of a larger scalar, so its text
    // is spliced raw (an empty value splices to nothing).
    const standalone = /^\s*(-\s*)?([^:#]*:\s*)?$/.test(before) && after.trim() === "";
    let replacement: string;
    if (!result.supported) {
      replacement = '"__safeguard_unsupported__"';
    } else if (standalone) {
      replacement = yamlLiteral(result.value);
    } else if (typeof result.value === "string") {
      replacement = result.value;
    } else {
      replacement = yamlLiteral(result.value);
    }
    out += before + replacement;
    index = end + 2;
  }
}

export function prepareHelmTemplate(
  path: string,
  text: string,
  files: Record<string, string | null>,
): { text: string; chart: HelmChart | null } {
  const chart = loadHelmChart(files, path);
  const lines = text.split("\n");
  const out = [...lines];
  const stack: ConditionalFrame[] = [];
  const active = () => stack.every((frame) => frame.active);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const action = /^\s*{{[-+]?\s*([\s\S]*?)\s*[-+]?}}\s*$/.exec(line);
    if (!action) {
      out[i] = active() ? substituteInlineExpressions(line, chart?.values ?? null) : "";
      continue;
    }
    out[i] = "";
    const body = action[1].trim();
    const keyword = body.split(/\s+/, 1)[0] ?? "";
    const rest = body.slice(keyword.length).trim();
    if (keyword === "if") {
      const parentActive = active();
      const result = parentActive ? evaluateHelmCondition(rest, chart?.values ?? null) : false;
      // An indeterminate condition blanks its block. That content may or may
      // not deploy, so it must not become evidence either way.
      const resolved = result === true;
      stack.push({ parentActive, taken: resolved, active: parentActive && resolved });
    } else if (keyword === "else") {
      const frame = stack[stack.length - 1];
      if (!frame) continue;
      if (rest.startsWith("if")) {
        const condition = rest.slice(2).trim();
        const result = frame.parentActive && !frame.taken
          ? evaluateHelmCondition(condition, chart?.values ?? null)
          : false;
        const resolved = result === true;
        frame.active = frame.parentActive && !frame.taken && resolved;
        frame.taken = frame.taken || resolved;
      } else {
        frame.active = frame.parentActive && !frame.taken;
        frame.taken = true;
      }
    } else if (keyword === "end") {
      stack.pop();
    } else if (["range", "with", "define", "block"].includes(keyword)) {
      // `range`, `with`, `define`, and `block` are structural/template
      // behavior, not repository facts.
      stack.push({ parentActive: active(), taken: true, active: false });
      // The generic `end` handler pops whatever frame is open.
    } else {
      // Comments, includes, assignments, and template invocations do not open
      // a conditional block, so they must not disturb the `if`/`end` stack.
    }
  }
  return { text: out.join("\n"), chart };
}

export function helmValueEnabled(values: YamlValue | null, path: string[]): boolean | null {
  if (!path.length) return null;
  const record = asRecord(getPath(values ?? null, path.slice(0, -1)));
  const leaf = path[path.length - 1];
  const value = record ? record[leaf] : undefined;
  return asBoolean(value);
}
