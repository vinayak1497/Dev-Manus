/**
 * Provider-chain selection tests.
 *
 * The chain must prefer the operator-configured live provider, try configured
 * fallbacks in order, and always end with the deterministic provider. No test
 * makes a network call: constructing a provider only reads its key/model.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderChain } from "../../lib/ai/index";

const MANAGED = [
  "AI_ENABLED",
  "AI_PRIMARY_PROVIDER",
  "AI_FALLBACK_PROVIDERS",
  "AI_GOOGLE_ENABLED",
  "AI_GOOGLE_API_KEY",
  "AI_GOOGLE_MODEL",
  "AI_OPENAI_ENABLED",
  "AI_OPENAI_API_KEY",
  "AI_OPENAI_MODEL",
  "AI_DEEPSEEK_ENABLED",
  "AI_DEEPSEEK_API_KEY",
  "AI_DEEPSEEK_MODEL",
  "ANTHROPIC_API_KEY",
] as const;

const original = new Map<string, string | undefined>(
  MANAGED.map((name) => [name, process.env[name]]),
);

test.beforeEach(() => {
  for (const name of MANAGED) delete process.env[name];
});

test.afterEach(() => {
  for (const name of MANAGED) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function names(): string[] {
  return buildProviderChain().map((provider) => provider.name);
}

test("no keys means only the honest deterministic fallback", () => {
  assert.deepEqual(names(), ["deterministic-rules"]);
});

test("configured primary and fallback order is preserved", () => {
  process.env.AI_PRIMARY_PROVIDER = "deepseek";
  process.env.AI_FALLBACK_PROVIDERS = "google,openai";
  process.env.AI_GOOGLE_API_KEY = "test-google";
  process.env.AI_OPENAI_API_KEY = "test-openai";
  process.env.AI_DEEPSEEK_API_KEY = "test-deepseek";

  assert.deepEqual(names(), [
    "deepseek",
    "google-gemini",
    "openai",
    "deterministic-rules",
  ]);
});

test("google is first by default when only its key exists", () => {
  process.env.AI_GOOGLE_API_KEY = "test-google";
  assert.deepEqual(names(), ["google-gemini", "deterministic-rules"]);
});

test("a disabled provider is skipped even when its key exists", () => {
  process.env.AI_GOOGLE_ENABLED = "false";
  process.env.AI_GOOGLE_API_KEY = "test-google";
  assert.deepEqual(names(), ["deterministic-rules"]);
});

test("AI_ENABLED=false forces the deterministic provider", () => {
  process.env.AI_ENABLED = "false";
  process.env.AI_GOOGLE_API_KEY = "test-google";
  assert.deepEqual(names(), ["deterministic-rules"]);
});

test("an existing Anthropic-only deployment still works", () => {
  process.env.ANTHROPIC_API_KEY = "test-anthropic";
  assert.deepEqual(names(), ["anthropic", "deterministic-rules"]);
});

test("unconfigured providers with keys are tried after explicit ones", () => {
  process.env.AI_PRIMARY_PROVIDER = "google";
  process.env.AI_FALLBACK_PROVIDERS = "openai";
  process.env.AI_GOOGLE_API_KEY = "test-google";
  process.env.AI_OPENAI_API_KEY = "test-openai";
  process.env.AI_DEEPSEEK_API_KEY = "test-deepseek";

  assert.deepEqual(names(), [
    "google-gemini",
    "openai",
    "deepseek",
    "deterministic-rules",
  ]);
});
