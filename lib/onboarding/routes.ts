/**
 * Static application-route evidence.
 *
 * Probes prove that Kubernetes checks a path; they do not prove that the path
 * is a useful external application check. Route registrations prove that an
 * application serves a path. Only concrete, non-parameterized route literals
 * become application health candidates. Control, debug, and test routes are
 * excluded so fault-injection switches and panics can never become monitoring
 * targets.
 */
import { lineOf } from "./manifests";

export type RouteFinding = {
  path: string;
  methods: string[];
  kind: "application" | "auxiliary" | "administrative";
  sourcePath: string;
  line?: number;
  confidence: "high" | "medium" | "low";
  explanation: string;
};

function routeKind(path: string): RouteFinding["kind"] {
  const normalized = path.toLowerCase();
  if (
    normalized.startsWith("/debug/") ||
    normalized.startsWith("/swagger") ||
    normalized.startsWith("/docs") ||
    normalized.startsWith("/redoc") ||
    normalized.startsWith("/openapi") ||
    normalized.startsWith("/fault") ||
    normalized.startsWith("/chaos") ||
    normalized.startsWith("/panic") ||
    normalized.startsWith("/kill") ||
    normalized.startsWith("/admin") ||
    normalized.startsWith("/login") ||
    normalized.startsWith("/token") ||
    normalized.startsWith("/internal")
  ) {
    return "administrative";
  }
  if (
    normalized.startsWith("/metrics") ||
    normalized.startsWith("/health") ||
    normalized.startsWith("/ready") ||
    normalized.startsWith("/live") ||
    normalized.startsWith("/startup") ||
    normalized.startsWith("/version") ||
    normalized.startsWith("/status")
  ) {
    return "auxiliary";
  }
  return "application";
}

function cleanPath(path: string): string | null {
  if (!path.startsWith("/")) return null;
  if (path.includes("*") || path.includes("{") || path.includes("}") || path.includes(":")) return null;
  if (path.length > 128) return null;
  const normalized = path.replace(/\/{2,}/g, "/");
  if (/\.(js|css|png|svg|ico|map|txt|html)$/i.test(normalized)) return null;
  return normalized;
}

function addRoute(
  out: RouteFinding[],
  path: string,
  methods: string[],
  sourcePath: string,
  text: string,
  confidence: RouteFinding["confidence"],
  explanation: string,
): void {
  const cleaned = cleanPath(path.split(/[?#]/, 1)[0]);
  if (!cleaned) return;
  const line = lineOf(text, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  out.push({
    path: cleaned,
    methods: Array.from(new Set(methods.map((method) => method.toUpperCase()))),
    kind: routeKind(cleaned),
    sourcePath,
    ...(line === undefined ? {} : { line }),
    confidence,
    explanation,
  });
}

function goRoutes(text: string, sourcePath: string, out: RouteFinding[]): void {
  const pattern = /\.(HandleFunc|Handle|Path|PathPrefix)\(\s*("[^"\n]+"|'[^'\n]+')/g;
  for (const match of Array.from(text.matchAll(pattern))) {
    const literal = match[2].slice(1, -1);
    const methods = Array.from(text.slice(match.index, match.index + 240).matchAll(/\.Methods\(\s*([^)]+)\)/g))
      .flatMap((call) => Array.from(call[1].matchAll(/"([A-Z]+)"|'([A-Z]+)'/g)).map((method) => method[1] ?? method[2]));
    addRoute(out, literal, methods, sourcePath, text, "medium", `Go router registers ${literal}.`);
  }
  const frameworkPattern = /\.(get|post|put|delete|patch|head|options)\(\s*("[^"\n]+"|'[^'\n]+')/gi;
  for (const match of Array.from(text.matchAll(frameworkPattern))) {
    addRoute(out, match[2].slice(1, -1), [match[1]], sourcePath, text, "medium", `Go web framework registers ${match[2].slice(1, -1)}.`);
  }
}

function nodeRoutes(text: string, sourcePath: string, out: RouteFinding[]): void {
  const pattern = /\.(get|post|put|delete|patch|head|options|use|all)\(\s*("[^"\n]+"|'[^'\n]+'|`[^`\n]+`)/gi;
  for (const match of Array.from(text.matchAll(pattern))) {
    addRoute(out, match[2].slice(1, -1), [match[1]], sourcePath, text, "medium", `JavaScript router registers ${match[2].slice(1, -1)}.`);
  }
}

function pythonRoutes(text: string, sourcePath: string, out: RouteFinding[]): void {
  const pattern = /@(?:app|router|api|blueprint)\.(get|post|put|delete|patch|head|options)\(\s*("[^"\n]+"|'[^'\n]+')/gi;
  for (const match of Array.from(text.matchAll(pattern))) {
    addRoute(out, match[2].slice(1, -1), [match[1]], sourcePath, text, "medium", `Python router registers ${match[2].slice(1, -1)}.`);
  }
  const rulePattern = /\.add_url_rule\(\s*("[^"\n]+"|'[^'\n]+')/g;
  for (const match of Array.from(text.matchAll(rulePattern))) {
    addRoute(out, match[1].slice(1, -1), [], sourcePath, text, "medium", `Python application maps ${match[1].slice(1, -1)}.`);
  }
}

function nextRoutes(path: string, out: RouteFinding[]): void {
  const match = /(?:^|\/)app\/(.+)\/route\.(ts|js|tsx|jsx)$/.exec(path);
  if (!match) return;
  addRoute(out, `/${match[1]}`, [], path, path, "high", `Next.js App Router serves ${match[1]} as an API route.`);
}

/** Find concrete application routes in downloaded source files. */
export function extractRouteFindings(files: Record<string, string | null>): RouteFinding[] {
  const out: RouteFinding[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== "string" || content === "") continue;
    if (path.endsWith(".go")) goRoutes(content, path, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(path)) nodeRoutes(content, path, out);
    else if (path.endsWith(".py")) pythonRoutes(content, path, out);
    nextRoutes(path, out);
  }
  const seen = new Set<string>();
  return out.filter((route) => {
    const key = `${route.sourcePath}\0${route.path}\0${route.methods.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
