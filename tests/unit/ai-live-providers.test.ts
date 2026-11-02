/**
 * Live-provider request/response tests with a stubbed fetch.
 *
 * These prove the provider classes send the evidence and credentials in the
 * expected shape, validate the returned JSON, and never trust raw model text.
 * They do not call any external service.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { GoogleGeminiProvider } from "../../lib/ai/providers/google";
import { OpenAICompatibleProvider } from "../../lib/ai/providers/openai";
import type { IncidentAnalysisInput } from "../../lib/ai/types";

const DETECTED_AT = "2026-01-01T12:00:00.000Z";
const originalFetch = globalThis.fetch;

function input(): IncidentAnalysisInput {
  return {
    incident: {
      title: "api degraded",
      severity: "critical",
      status: "open",
      detectedAt: DETECTED_AT,
      serviceName: "api",
      environment: "production",
    },
    evidence: [
      {
        source: "metric",
        label: "Health check reading",
        detail: "status=critical, latency=900ms",
        observedAt: DETECTED_AT,
      },
    ],
    timeline: [],
    healthChecks: [],
    deployment: null,
    serviceState: { name: "api", status: "critical" },
  };
}

function validAnalysis(): Record<string, unknown> {
  return {
    observation: "api returned critical health checks",
    evidence: [
      {
        source: "metric",
        timestamp: DETECTED_AT,
        statement: "status=critical, latency=900ms",
      },
    ],
    interpretation: "The supplied reading shows a degradation.",
    confidence: "medium",
    suggestedActions: [],
    insufficientEvidence: false,
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("google sends the key in a header and validates the model JSON", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = String(url);
    captured.init = init;
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify(validAnalysis()) }],
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const provider = new GoogleGeminiProvider("test-google-key", "gemini-2.5-flash");
  const analysis = await provider.analyzeIncident(input());

  assert.equal(analysis.confidence, "medium");
  assert.ok(captured.url);
  assert.match(captured.url, /gemini-2\.5-flash:generateContent/);
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["x-goog-api-key"], "test-google-key");
  const body = JSON.parse(String(captured.init?.body)) as {
    systemInstruction: { parts: Array<{ text: string }> };
    generationConfig: { responseMimeType: string };
  };
  assert.match(body.systemInstruction.parts[0].text, /Do not invent/);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
});

test("openai sends a bearer token and requests JSON mode", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = String(url);
    captured.init = init;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(validAnalysis()) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const provider = new OpenAICompatibleProvider({
    name: "openai",
    apiKey: "test-openai-key",
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    jsonMode: true,
  });
  const analysis = await provider.analyzeIncident(input());

  assert.equal(analysis.insufficientEvidence, false);
  assert.ok(captured.url);
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer test-openai-key");
  const body = JSON.parse(String(captured.init?.body)) as {
    response_format: { type: string };
    messages: Array<{ role: string; content: string }>;
  };
  assert.equal(body.response_format.type, "json_object");
  assert.equal(body.messages[0].role, "system");
  assert.match(body.messages[1].content, /Health check reading/);
});

test("an invalid model payload is rejected instead of stored", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "not json" } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  const provider = new OpenAICompatibleProvider({
    name: "openai",
    apiKey: "test-openai-key",
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    jsonMode: true,
  });

  await assert.rejects(() => provider.analyzeIncident(input()));
});
