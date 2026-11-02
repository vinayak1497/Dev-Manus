/**
 * Anthropic-backed AI provider (acceptance §107 step 11).
 *
 * Calls the Messages API over fetch (no SDK dependency). The API key is read
 * from the server-only environment and is never logged, never returned, and
 * never sent to the browser. Output is validated by parseIncidentAnalysis
 * before it is trusted; on any network, timeout, rate-limit or schema failure
 * this throws so the caller can fall back to the deterministic provider
 * WITHOUT silently changing result semantics (§11).
 *
 * The system prompt carries the hard anti-hallucination contract (§13).
 */

import type {
  AIProvider,
  IncidentAnalysis,
  IncidentAnalysisInput,
} from "../types";
import { parseIncidentAnalysis } from "../schema";
import {
  SYSTEM_PROMPT,
  extractJson,
  providerInputMessage,
  readMaxOutputTokens,
  readTemperature,
  readTimeoutMs,
} from "./shared";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  /** Build from env; returns null when no key is configured. */
  static fromEnv(): AnthropicProvider | null {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || !key.trim()) return null;
    return new AnthropicProvider(key.trim());
  }

  async analyzeIncident(
    input: IncidentAnalysisInput,
  ): Promise<IncidentAnalysis> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), readTimeoutMs());
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: readMaxOutputTokens(),
          temperature: readTemperature(),
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: providerInputMessage(input),
            },
          ],
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Log status only — never the key, prompt, or evidence body.
      throw new Error(`anthropic request failed with status ${res.status}`);
    }

    const payload = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text =
      payload.content?.find((b) => b.type === "text")?.text ?? "";
    const parsed = parseIncidentAnalysis(extractJson(text));
    if (!parsed.ok) {
      throw new Error(`anthropic output failed validation: ${parsed.error}`);
    }
    return parsed.value;
  }
}
