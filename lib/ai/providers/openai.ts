/**
 * OpenAI-compatible chat-completions provider.
 *
 * This one class serves both OpenAI and DeepSeek (and any future provider with
 * the same request/response shape). It has no SDK dependency, keeps the key
 * server-only, and validates the model output exactly like every other
 * provider. The API key is never logged or placed in a URL.
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

type ProviderKind = "openai" | "deepseek";

type ProviderConfig = {
  name: string;
  endpoint: string;
  defaultModel: string;
  modelVar: string;
  keyVars: string[];
  enabledVar: string;
  jsonMode: boolean;
};

const CONFIG: Record<ProviderKind, ProviderConfig> = {
  openai: {
    name: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    modelVar: "AI_OPENAI_MODEL",
    keyVars: ["AI_OPENAI_API_KEY", "OPENAI_API_KEY"],
    enabledVar: "AI_OPENAI_ENABLED",
    jsonMode: true,
  },
  deepseek: {
    name: "deepseek",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    modelVar: "AI_DEEPSEEK_MODEL",
    keyVars: ["AI_DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"],
    enabledVar: "AI_DEEPSEEK_ENABLED",
    jsonMode: false,
  },
};

function isDisabled(flag: string): boolean {
  const value = process.env[flag]?.trim().toLowerCase();
  return value === "false" || value === "0" || value === "off";
}

function readKey(vars: string[]): string | null {
  for (const name of vars) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly jsonMode: boolean;

  constructor(options: {
    name: string;
    apiKey: string;
    model: string;
    endpoint: string;
    jsonMode: boolean;
  }) {
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.endpoint = options.endpoint;
    this.jsonMode = options.jsonMode;
  }

  static fromEnv(kind: ProviderKind): OpenAICompatibleProvider | null {
    const config = CONFIG[kind];
    if (isDisabled(config.enabledVar)) return null;
    const apiKey = readKey(config.keyVars);
    if (!apiKey) return null;
    return new OpenAICompatibleProvider({
      name: config.name,
      apiKey,
      model: process.env[config.modelVar]?.trim() || config.defaultModel,
      endpoint: config.endpoint,
      jsonMode: config.jsonMode,
    });
  }

  async analyzeIncident(
    input: IncidentAnalysisInput,
  ): Promise<IncidentAnalysis> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), readTimeoutMs());
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: providerInputMessage(input) },
          ],
          temperature: readTemperature(),
          max_tokens: readMaxOutputTokens(),
          ...(this.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      // Status only: never the key, prompt, or evidence body.
      throw new Error(`${this.name} request failed with status ${res.status}`);
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new Error(`${this.name} returned no text`);
    }

    const parsed = parseIncidentAnalysis(extractJson(text));
    if (!parsed.ok) {
      throw new Error(`${this.name} output failed validation: ${parsed.error}`);
    }
    return parsed.value;
  }
}
