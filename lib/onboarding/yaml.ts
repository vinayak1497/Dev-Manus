/**
 * Minimal, dependency-free YAML-subset parser for repository evidence.
 *
 * The analyzer needs structure — workload container ports, Service target
 * ports, Helm values, Compose services — but the project has no YAML parser
 * and adding one for this single use would violate the dependency rules.
 * This parser therefore supports only the subset used by deployment
 * configuration:
 *
 * - nested block mappings and sequences
 * - quoted and plain scalars
 * - literal (`|`) and folded (`>`) blocks
 * - inline flow collections (`{a: b}`, `[1, two]`)
 * - JSON documents
 * - YAML anchors, aliases, and merge keys
 *
 * Anything else produces a structured parse error. Callers must treat an
 * unparsable document as unknown evidence, never as a reason to guess.
 */

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue };

export type YamlDocument = {
  value: YamlValue;
  error: string | null;
};

type Line = {
  text: string;
  number: number;
  indent: number;
};

function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote === null) {
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
        return line.slice(0, i).replace(/\s+$/, "");
      }
    } else if (ch === quote) {
      if (quote === "'" && line[i + 1] === "'") i += 1;
      else if (quote === '"' && line[i - 1] !== "\\") quote = null;
      else if (quote === "'") quote = null;
    }
  }
  return line;
}

function toLines(text: string): Line[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((raw, index) => {
      const cleaned = stripComment(raw).replace(/\s+$/, "");
      const indent = cleaned.match(/^ */)?.[0].length ?? 0;
      return { text: cleaned, number: index + 1, indent };
    });
}

function unquoteScalar(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseScalar(text: string): YamlScalar {
  const t = text.trim();
  if (t === "" || t === "null" || t === "Null" || t === "NULL" || t === "~") return null;
  if (t === "true" || t === "True" || t === "TRUE") return true;
  if (t === "false" || t === "False" || t === "FALSE") return false;
  if (/^[+-]?\d+$/.test(t)) {
    const n = Number.parseInt(t, 10);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return unquoteScalar(t);
}

class FlowParser {
  private text: string;
  private index = 0;
  private depth = 0;

  constructor(text: string) {
    this.text = text;
  }

  parse(): YamlValue {
    if (this.depth > 100) throw new Error("flow nesting is too deep");
    this.depth += 1;
    try {
      this.skipSpaces();
      const ch = this.text[this.index];
      if (ch === "[") return this.parseSequence();
      if (ch === "{") return this.parseMapping();
      return parseScalar(this.text.trim());
    } finally {
      this.depth -= 1;
    }
  }

  private skipSpaces(): void {
    while (this.index < this.text.length && /\s/.test(this.text[this.index] ?? "")) {
      this.index += 1;
    }
  }

  private parseSequence(): YamlValue[] {
    this.index += 1; // [
    const out: YamlValue[] = [];
    for (;;) {
      this.skipSpaces();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return out;
      }
      out.push(this.parseValue());
      this.skipSpaces();
      if (this.text[this.index] === ",") this.index += 1;
    }
  }

  private parseMapping(): { [key: string]: YamlValue } {
    this.index += 1; // {
    const out: { [key: string]: YamlValue } = {};
    for (;;) {
      this.skipSpaces();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return out;
      }
      const key = this.parseKey();
      this.skipSpaces();
      if (this.text[this.index] !== ":") throw new Error("flow mapping needs a colon");
      this.index += 1;
      out[key] = this.parseValue();
      this.skipSpaces();
      if (this.text[this.index] === ",") this.index += 1;
    }
  }

  private parseKey(): string {
    const start = this.index;
    let quote: '"' | "'" | null = null;
    while (this.index < this.text.length) {
      const ch = this.text[this.index] ?? "";
      if (quote !== null) {
        if (ch === quote) quote = null;
        this.index += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        this.index += 1;
        continue;
      }
      if (ch === ":") break;
      this.index += 1;
    }
    const raw = this.text.slice(start, this.index).trim();
    const scalar = parseScalar(raw);
    if (typeof scalar !== "string") throw new Error("mapping keys must be strings");
    return scalar;
  }

  private parseValue(): YamlValue {
    this.skipSpaces();
    const ch = this.text[this.index] ?? "";
    if (ch === "[" || ch === "{") return this.parse();
    let start = this.index;
    let quote: '"' | "'" | null = null;
    let depth = 0;
    while (this.index < this.text.length) {
      const c = this.text[this.index] ?? "";
      if (quote !== null) {
        if (c === quote) quote = null;
        this.index += 1;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        this.index += 1;
        continue;
      }
      if (c === "[" || c === "{") depth += 1;
      if (c === "]" || c === "}") {
        if (depth === 0) break;
        depth -= 1;
      }
      if ((c === "," || c === ":" || c === "]" || c === "}") && depth === 0) break;
      this.index += 1;
    }
    void start;
    const raw = this.text.slice(start, this.index).trim();
    const scalar = parseScalar(raw);
    if (typeof scalar === "string" && (raw.startsWith("[") || raw.startsWith("{"))) {
      return new FlowParser(raw).parse();
    }
    return scalar;
  }
}

type ParserState = {
  lines: Line[];
  index: number;
  anchors: Map<string, YamlValue>;
  depth: number;
  nodes: number;
};

function countNode(state: ParserState): void {
  state.nodes += 1;
  // Repository content is untrusted. A small file can otherwise expand into a
  // very large value through anchors, aliases, or pathological nesting.
  if (state.nodes > 100_000) throw new Error("document is too large to parse safely");
}

function enterBlock(state: ParserState): void {
  state.depth += 1;
  if (state.depth > 200) throw new Error("block nesting is too deep");
}

function leaveBlock(state: ParserState): void {
  state.depth -= 1;
}

function nextMeaningful(state: ParserState): Line | null {
  while (state.index < state.lines.length) {
    const line = state.lines[state.index];
    if (line.text.trim() === "" || line.text.trim().startsWith("%")) {
      state.index += 1;
      continue;
    }
    return line;
  }
  return null;
}

function splitKeyValue(text: string): { key: string; value: string } | null {
  let quote: '"' | "'" | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth += 1;
    else if (ch === "]" || ch === "}") depth -= 1;
    else if (ch === ":" && depth === 0 && (text[i + 1] === " " || text[i + 1] === "\t" || i === text.length - 1)) {
      return { key: text.slice(0, i), value: text.slice(i + 1) };
    }
  }
  return null;
}

function applyAnchor(text: string, value: YamlValue, state: ParserState): YamlValue {
  const m = /^&([A-Za-z0-9_-]+)\s*(.*)$/.exec(text);
  if (!m) return value;
  state.anchors.set(m[1], value);
  if (m[2].trim() === "") return value;
  return parseInlineValue(m[2], state);
}

function resolveAlias(text: string, state: ParserState): YamlValue {
  const m = /^\*([A-Za-z0-9_-]+)$/.exec(text.trim());
  if (!m) throw new Error(`unsupported value ${text}`);
  const value = state.anchors.get(m[1]);
  if (value === undefined) throw new Error(`unknown anchor ${m[1]}`);
  const cloned = structuredClone(value);
  // Count the expansion, not just the `*alias` token, so an anchor cannot be
  // used to smuggle a much larger document past the node budget.
  const size = JSON.stringify(cloned).length;
  state.nodes += Math.ceil(size / 32);
  if (state.nodes > 100_000) throw new Error("document is too large to parse safely");
  return cloned;
}

function parseInlineValue(text: string, state: ParserState): YamlValue {
  countNode(state);
  const t = text.trim();
  if (t.startsWith("&")) {
    const m = /^&([A-Za-z0-9_-]+)\s*(.*)$/.exec(t);
    if (!m) throw new Error(`bad anchor ${t}`);
    if (m[2].trim() === "") throw new Error("anchors need a value on a following line");
    const value = parseInlineValue(m[2], state);
    state.anchors.set(m[1], value);
    return value;
  }
  if (t.startsWith("*")) return resolveAlias(t, state);
  if (t.startsWith("[") || t.startsWith("{")) return new FlowParser(t).parse();
  return parseScalar(t);
}

function parseBlockScalar(lines: Line[], start: number, header: string): { value: string; next: number } {
  const mode = header.trim()[0];
  const content: string[] = [];
  let index = start;
  let contentIndent: number | null = null;
  while (index < lines.length) {
    const line = lines[index];
    if (line.text.trim() === "") {
      content.push("");
      index += 1;
      continue;
    }
    if (contentIndent === null) {
      if (line.indent <= lines[start - 1].indent) break;
      contentIndent = line.indent;
    }
    if (line.indent < (contentIndent ?? 0)) break;
    content.push(line.text.slice(contentIndent ?? 0));
    index += 1;
  }
  while (content.length > 0 && content[content.length - 1] === "") content.pop();
  if (mode === "|") return { value: `${content.join("\n")}\n`, next: index };
  const paragraphs: string[][] = [[]];
  for (const line of content) {
    if (line === "") paragraphs.push([]);
    else paragraphs[paragraphs.length - 1].push(line.replace(/^ +/, ""));
  }
  return {
    value: paragraphs
      .filter((p) => p.length > 0)
      .map((p) => p.join(" "))
      .join("\n\n"),
    next: index,
  };
}

function parseBlock(state: ParserState, minIndent: number): YamlValue {
  enterBlock(state);
  try {
    const line = nextMeaningful(state);
    if (!line || line.indent < minIndent) return null;
    if (/^-\s*(.*)$/.test(line.text.slice(line.indent))) return parseSequence(state, line.indent);
    return parseMapping(state, line.indent);
  } finally {
    leaveBlock(state);
  }
}

function parseSequence(state: ParserState, indent: number): YamlValue[] {
  enterBlock(state);
  try {
  const out: YamlValue[] = [];
  for (;;) {
    const line = nextMeaningful(state);
    if (!line || line.indent !== indent) break;
    const body = line.text.slice(indent);
    const m = /^-\s*(.*)$/.exec(body);
    if (!m) break;
    state.index += 1;
    const rest = m[1].trim();
    if (rest === "") {
      out.push(parseBlock(state, indent + 1));
      continue;
    }
    if (/^-\s/.test(rest) || rest === "-") {
      const inline: ParserState = {
        lines: [{ text: `${" ".repeat(indent + 2)}${rest}`, number: line.number, indent: indent + 2 }],
        index: 0,
        anchors: state.anchors,
        depth: state.depth,
        nodes: 0,
      };
      const nested = parseSequence(inline, indent + 2);
      state.depth = inline.depth;
      state.nodes += inline.nodes;
      countNode(state);
      out.push(nested);
      continue;
    }
    const kv = splitKeyValue(rest);
    if (!kv) {
      out.push(parseInlineValue(rest, state));
      continue;
    }
    out.push(parseInlineMapping(state, line, indent, kv));
  }
  return out;
  } finally {
    leaveBlock(state);
  }
}

function parseInlineMapping(
  state: ParserState,
  line: Line,
  indent: number,
  first: { key: string; value: string },
): { [key: string]: YamlValue } {
  enterBlock(state);
  try {
  const map: { [key: string]: YamlValue } = {};
  const key = unquoteScalar(first.key);
  if (key === "<<") {
    Object.assign(map, parseMergeValue(first.value, state));
  } else {
    map[key] = parseMappingValue(state, line, first.value);
  }
  for (;;) {
    const peek = nextMeaningful(state);
    if (!peek || peek.indent <= indent) break;
    const text = peek.text.slice(peek.indent);
    if (/^-\s*/.test(text)) break;
    const kv = splitKeyValue(text);
    if (!kv) throw new Error(`line ${peek.number}: expected key: value`);
    state.index += 1;
    const k = unquoteScalar(kv.key);
    if (k === "") throw new Error(`line ${peek.number}: empty key`);
    if (k === "<<") Object.assign(map, parseMergeValue(kv.value, state));
    else {
      if (k in map) throw new Error(`line ${peek.number}: duplicate key ${k}`);
      map[k] = parseMappingValue(state, peek, kv.value);
    }
  }
  return map;
  } finally {
    leaveBlock(state);
  }
}

function parseMergeValue(text: string, state: ParserState): { [key: string]: YamlValue } {
  const value = parseInlineValue(text, state);
  const sources = Array.isArray(value) ? value : [value];
  const out: { [key: string]: YamlValue } = {};
  for (const source of sources) {
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      throw new Error("merge keys need mappings");
    }
    Object.assign(out, source);
  }
  return out;
}

function parseMappingValue(state: ParserState, line: Line, rawValue: string): YamlValue {
  const value = rawValue.trim();
  if (value === "") {
    const peek = nextMeaningful(state);
    if (!peek || peek.indent < line.indent) return null;
    // A block sequence may start at the same indentation as its mapping key
    // (`key:\n- item`). A mapping key at the same indentation is a sibling.
    if (peek.indent === line.indent) {
      const text = peek.text.slice(peek.indent);
      if (!/^-\s/.test(text) && text !== "-") return null;
    }
    return parseBlock(state, peek.indent);
  }
  if (value === "|" || value.startsWith("| ") || value === ">" || value.startsWith("> ")) {
    const parsed = parseBlockScalar(state.lines, state.index, value);
    state.index = parsed.next;
    return parsed.value;
  }
  return applyAnchor(value, parseInlineValue(value, state), state);
}

function parseMapping(state: ParserState, indent: number): { [key: string]: YamlValue } {
  enterBlock(state);
  try {
  const out: { [key: string]: YamlValue } = {};
  for (;;) {
    const line = nextMeaningful(state);
    if (!line || line.indent !== indent) break;
    const text = line.text.slice(indent);
    if (/^-\s*/.test(text)) break;
    const kv = splitKeyValue(text);
    if (!kv) throw new Error(`line ${line.number}: expected key: value`);
    state.index += 1;
    const key = unquoteScalar(kv.key);
    if (key === "") throw new Error(`line ${line.number}: empty key`);
    if (key === "<<") {
      Object.assign(out, parseMergeValue(kv.value, state));
      continue;
    }
    if (key in out) throw new Error(`line ${line.number}: duplicate key ${key}`);
    out[key] = parseMappingValue(state, line, kv.value);
  }
  return out;
  } finally {
    leaveBlock(state);
  }
}

function splitDocuments(text: string): string[] {
  const docs: string[] = [];
  let current: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = stripComment(raw).trim();
    if (/^---(\s|$)/.test(line)) {
      if (current.join("\n").trim() !== "") docs.push(current.join("\n"));
      current = [];
      continue;
    }
    if (/^\.\.\.(\s|$)/.test(line)) {
      if (current.join("\n").trim() !== "") docs.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(raw);
  }
  if (current.join("\n").trim() !== "") docs.push(current.join("\n"));
  return docs;
}

function parseOneDocument(text: string): YamlDocument {
  if (text.trim() === "") return { value: null, error: null };
  const first = text.trimStart();
  if (first.startsWith("{") || first.startsWith("[")) {
    try {
      return { value: JSON.parse(text) as YamlValue, error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "bad JSON" };
    }
  }
  const lines = toLines(text).filter((line) => {
    const t = line.text.trim();
    return t !== "" && !t.startsWith("%");
  });
  if (lines.length === 0) return { value: null, error: null };
  if (lines.some((line) => /^\t+/.test(line.text))) {
    return { value: null, error: "tabs are not valid YAML indentation" };
  }
  const state: ParserState = { lines, index: 0, anchors: new Map(), depth: 0, nodes: 0 };
  try {
    const value = parseBlock(state, lines[0].indent);
    if (nextMeaningful(state)) return { value: null, error: "unexpected content after document" };
    return { value, error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "bad YAML" };
  }
}

/** Parse every `---`-separated document. Failures are per-document, never thrown. */
export function parseYamlDocuments(text: string): YamlDocument[] {
  return splitDocuments(text).map(parseOneDocument);
}

/** Parse one document; a convenience wrapper for single-document config files. */
export function parseYamlDocument(text: string): YamlDocument {
  const docs = parseYamlDocuments(text);
  if (docs.length === 0) return { value: null, error: null };
  return docs[0];
}
