/**
 * Google Gemini-backed AI provider.
 *
 * Uses the Generative Language API directly (no SDK dependency). The server-only
 * `AI_GOOGLE_API_KEY` is sent in a header, never in a URL or log. Output is
 * validated by `parseIncidentAnalysis`; any network, timeout, safety, or schema
 * failure throws so the provider chain can fall through honestly.
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

const DEFAULT_MODEL = "gemini-2.5-flash";
const ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function isDisabled(flag: string): boolean {
  const value = process.env[flag]?.trim().toLowerCase();
  return value === "false" || value === "0" || value === "off";
}

export class GoogleGeminiProvider implements AIProvider {
  readonly name = "google-gemini";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? process.env.AI_GOOGLE_MODEL ?? DEFAULT_MODEL;
  }

  /** Build from env; returns null when no usable key/flag is configured. */
  static fromEnv(): GoogleGeminiProvider | null {
    if (isDisabled("AI_GOOGLE_ENABLED")) return null;
    const key = process.env.AI_GOOGLE_API_KEY?.trim();
    if (!key) return null;
    return new GoogleGeminiProvider(key);
  }

  async analyzeIncident(
    input: IncidentAnalysisInput,
  ): Promise<IncidentAnalysis> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), readTimeoutMs());
    let res: Response;
    try {
      res = await fetch(
        `${ENDPOINT_BASE}/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: providerInputMessage(input) }],
              },
            ],
            generationConfig: {
              temperature: readTemperature(),
              maxOutputTokens: readMaxOutputTokens(),
              responseMimeType: "application/json",
            },
          }),
        },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Status only: never the key, prompt, or evidence body.
      throw new Error(`google-gemini request failed with status ${res.status}`);
    }

    const payload = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };
    const candidate = payload.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";
    if (!text.trim()) {
      throw new Error(
        `google-gemini returned no text${
          candidate?.finishReason ? ` (${candidate.finishReason})` : ""
        }`,
      );
    }

    const parsed = parseIncidentAnalysis(extractJson(text));
    if (!parsed.ok) {
      throw new Error(`google-gemini output failed validation: ${parsed.error}`);
    }
    return parsed.value;
  }
}
