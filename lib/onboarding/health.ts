/**
 * Health target/path model.
 *
 * A monitoring target and an endpoint path are different facts. The target
 * says where Safeguard connects; the path says which route it checks there.
 * This module validates and joins them without unsafe string concatenation.
 */
import type { HealthTargetType } from "./types";

export const HEALTH_TARGET_TYPE_LABEL: Record<HealthTargetType, string> = {
  unknown: "Unknown",
  external_url: "External URL",
  kubernetes_service: "Kubernetes Service",
  ingress: "Ingress",
  load_balancer: "Load balancer",
  node_port: "NodePort",
  custom: "Custom",
};

const TARGET_MAX = 200;
const PATH_MAX = 200;

function hasCredentials(url: URL): boolean {
  return url.username !== "" || url.password !== "";
}

export function normalizeHealthTarget(target: string): { value: string | null; error: string | null } {
  const trimmed = target.trim();
  if (!trimmed) return { value: null, error: null };
  if (trimmed.length > TARGET_MAX) return { value: null, error: `Keep the target URL under ${TARGET_MAX} characters.` };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { value: null, error: "Enter an absolute target URL such as https://app.example.com." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { value: null, error: "Use an http:// or https:// monitoring target." };
  }
  if (!url.hostname) return { value: null, error: "The target URL needs a hostname." };
  if (hasCredentials(url)) {
    return { value: null, error: "Do not put credentials in the monitoring target URL." };
  }
  url.hash = "";
  return { value: url.toString(), error: null };
}

export function normalizeHealthPath(path: string): { value: string | null; error: string | null } {
  const trimmed = path.trim();
  if (!trimmed) return { value: null, error: null };
  if (trimmed.length > PATH_MAX) return { value: null, error: `Keep the endpoint path under ${PATH_MAX} characters.` };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return { value: null, error: "Put a full URL in Target URL and keep only the route path here." };
  }
  if (!trimmed.startsWith("/")) return { value: null, error: "Use a path like /api/health." };
  if (/[\s<>"]/.test(trimmed)) return { value: null, error: "The endpoint path contains an invalid character." };
  const hashSplit = trimmed.split("#", 1)[0];
  const querySplit = hashSplit.split("?", 2);
  const normalizedPath = querySplit[0].replace(/\/{2,}/g, "/");
  const normalized = querySplit.length > 1 ? `${normalizedPath}?${querySplit[1]}` : normalizedPath;
  return { value: normalized, error: null };
}

export function buildHealthCheckUrl(
  targetUrl: string,
  path: string,
): { url: string | null; error: string | null } {
  const target = normalizeHealthTarget(targetUrl);
  if (target.error) return { url: null, error: target.error };
  const endpoint = normalizeHealthPath(path);
  if (endpoint.error) return { url: null, error: endpoint.error };
  if (!target.value || !endpoint.value) return { url: null, error: null };
  const url = new URL(target.value);
  const base = url.pathname.replace(/\/+$/, "");
  const querySplit = endpoint.value.split("?", 2);
  const fullPath = `${base}${querySplit[0]}`.replace(/\/{2,}/g, "/") || "/";
  url.pathname = fullPath;
  url.search = querySplit.length > 1 ? `?${querySplit[1]}` : "";
  url.hash = "";
  return { url: url.toString(), error: null };
}

/**
 * Older drafts stored a complete URL in the endpoint field. Split it into the
 * current target/path shape instead of rejecting the user's saved work.
 */
export function splitHealthEndpoint(endpoint: string): { targetUrl: string; path: string } | null {
  const trimmed = endpoint.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || hasCredentials(url)) return null;
  url.hash = "";
  const path = `${url.pathname}${url.search}` || "/";
  url.pathname = "/";
  url.search = "";
  return { targetUrl: url.toString(), path };
}
