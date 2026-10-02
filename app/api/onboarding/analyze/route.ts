import { NextResponse } from "next/server";
import {
  analyzePublicRepository,
  unavailable,
  type GithubDeps,
  type HttpResult,
} from "@/lib/onboarding/github";

export const dynamic = "force-dynamic";

const JSON_TIMEOUT_MS = 12_000;
const TEXT_TIMEOUT_MS = 8_000;
const UA = "devops-safeguard-onboarding";

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

function headerMap(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function getJson(url: string): Promise<HttpResult<unknown>> {
  return withTimeout(JSON_TIMEOUT_MS, async (signal) => {
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": UA },
      cache: "no-store",
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const headers = headerMap(res);
    // Keep a short body excerpt so rate-limit detection can sniff it.
    if (typeof body === "string") headers["x-probe-body"] = body.slice(0, 300);
    else if (body && typeof body === "object") {
      const message = (body as { message?: unknown }).message;
      if (typeof message === "string") headers["x-probe-body"] = message.slice(0, 300);
    }
    return { status: res.status, headers, body };
  });
}

async function getText(url: string): Promise<{ status: number; body: string | null }> {
  return withTimeout(TEXT_TIMEOUT_MS, async (signal) => {
    const res = await fetch(url, { signal, headers: { "User-Agent": UA }, cache: "no-store" });
    if (res.status !== 200) return { status: res.status, body: null };
    try {
      return { status: 200, body: await res.text() };
    } catch {
      return { status: 200, body: null };
    }
  });
}

/**
 * POST /api/onboarding/analyze — honest repository inspection.
 *
 * Discovery is bounded and recursive (one `git/trees` call, then a prioritised
 * subset of files), and every failure mode is classified so a rate-limit is
 * never reported as "this repository has no configuration".
 */
export async function POST(request: Request) {
  let body: { repositoryUrl?: unknown; branch?: unknown };
  try {
    body = (await request.json()) as { repositoryUrl?: unknown; branch?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false as const, error: "Send a JSON body." },
      { status: 400 },
    );
  }

  const repositoryUrl = typeof body.repositoryUrl === "string" ? body.repositoryUrl : "";
  const branch = typeof body.branch === "string" ? body.branch : "";

  const deps: GithubDeps = { fetchJson: getJson, fetchText: getText };

  try {
    const analysis = await analyzePublicRepository({ repositoryUrl, branch }, deps);
    return NextResponse.json({ ok: true as const, analysis });
  } catch {
    // A total failure of our own plumbing is still a read failure, not an
    // empty repository.
    return NextResponse.json({
      ok: true as const,
      analysis: unavailable(
        { provider: "github", owner: null, repo: null, branch: branch.trim() || "main" },
        "read_failed",
      ),
    });
  }
}