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
import { REMEDIATION_ACTION_TYPES } from "../../remediation/actions";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";
const TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = [
  "You are an incident-analysis assistant for an SRE tool.",
  "You receive ONLY the structured evidence provided in the user message.",
  "Use only the supplied evidence. Do not invent logs, metrics, deployments, timestamps, services, or events.",
  "If the evidence is insufficient to determine a cause, set insufficientEvidence to true and say so plainly in interpretation.",
  "Correlation is not causation: never state that a deployment or change 'caused' the incident unless the evidence establishes it; prefer wording like 'occurred shortly before'.",
  "Respond with a SINGLE JSON object and nothing else (no prose, no code fences) matching exactly:",
  '{"observation":string,"evidence":[{"source":string,"timestamp":string|null,"statement":string}],"interpretation":string,"confidence":"low"|"medium"|"high","suggestedActions":[{"title":string,"description":string,"risk":"low"|"medium"|"high","actionType"?:string}],"insufficientEvidence":boolean}',
  `Every evidence[].statement must restate a supplied fact. actionType, when present, MUST be one of: ${REMEDIATION_ACTION_TYPES.join(", ")}.`,
].join(" ");

/** Pull the first JSON object out of a model response, tolerating fences. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object in model response");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;

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
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Incident evidence (JSON):\n${JSON.stringify(input)}`,
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
