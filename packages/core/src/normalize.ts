/**
 * Turn raw wire events into a `Trace` detectors can reason over.
 *
 * The important work here is defensive: the SDK emits two tool-name spellings,
 * three different `tool_definitions` shapes depending on the provider, and
 * millisecond-resolution timestamps that collide on fast agents. Everything
 * downstream depends on this layer absorbing that variance so no detector has
 * to.
 */

import type {
  NormalizedStep,
  NormalizedToolCall,
  TimelineNode,
  Trace,
  WireRunBundle,
  WireStep,
  WireToolCall,
} from "./types";

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Extract the tool names a step declared to the model. Providers disagree on
 * the shape, so we handle all three and never throw on malformed JSON — a
 * broken schema string yields an empty list, not a crashed analysis.
 */
export function extractDeclaredTools(raw: string | undefined): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const names: string[] = [];

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      // OpenAI-style: { type: "function", function: { name } }
      if (e.function && typeof e.function === "object") {
        const fn = e.function as Record<string, unknown>;
        if (typeof fn.name === "string") names.push(fn.name);
        continue;
      }
      // Bare: { name }
      if (typeof e.name === "string") names.push(e.name);
    }
  } else if (typeof parsed === "object" && parsed !== null) {
    // Record: { toolName: { ... } }
    for (const key of Object.keys(parsed as Record<string, unknown>)) {
      names.push(key);
    }
  }

  return [...new Set(names)];
}

function parseArgs(
  raw: string | undefined
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function normalizeStep(w: WireStep): NormalizedStep {
  return {
    kind: "step",
    id: w.step_id,
    prompt: w.prompt ?? "",
    response: w.response ?? "",
    startTime: ms(w.start_time),
    endTime: ms(w.end_time),
    statusCode: w.status_code,
    ...(w.status_message !== undefined && { statusMessage: w.status_message }),
    ...(w.model_used !== undefined && { modelUsed: w.model_used }),
    ...(w.finish_reason !== undefined && { finishReason: w.finish_reason }),
    declaredTools: extractDeclaredTools(w.tool_definitions),
  };
}

function normalizeToolCall(w: WireToolCall): NormalizedToolCall {
  // Bug #1: the wire uses `tool_name`; the SDK input type uses `name`. Resolve
  // once, here, so nothing downstream has to know both spellings exist.
  const name = w.tool_name ?? w.name ?? "unknown";
  const args = parseArgs(w.args);
  return {
    kind: "tool_call",
    id: w.tool_call_id,
    name,
    startTime: ms(w.start_time),
    endTime: ms(w.end_time),
    statusCode: w.status_code,
    ...(w.status_message !== undefined && { statusMessage: w.status_message }),
    ...(w.args !== undefined && { argsRaw: w.args }),
    ...(args !== undefined && { args }),
    ...(w.result !== undefined && { resultRaw: w.result }),
  };
}

export function normalize(bundle: WireRunBundle): Trace {
  const steps = (bundle.steps ?? []).map(normalizeStep);
  const toolCalls = (bundle.toolCalls ?? []).map(normalizeToolCall);

  // Interleave by start time. Ties (same-millisecond collisions on fast agents)
  // preserve arrival order via a stable sort, which JS's Array.sort guarantees.
  const timeline: TimelineNode[] = [...steps, ...toolCalls].sort(
    (a, b) => a.startTime - b.startTime
  );

  const declaredTools = [...new Set(steps.flatMap((s) => s.declaredTools))];

  return {
    runId: bundle.run_id,
    ...(bundle.session_id !== undefined && { sessionId: bundle.session_id }),
    userPrompt: bundle.prompt?.user_prompt ?? "",
    ...(bundle.prompt?.system_prompt !== undefined && {
      systemPrompt: bundle.prompt.system_prompt,
    }),
    response: bundle.response ?? "",
    startTime: ms(bundle.start_time),
    endTime: ms(bundle.end_time),
    statusCode: bundle.status_code,
    ...(bundle.status_message !== undefined && {
      statusMessage: bundle.status_message,
    }),
    timeline,
    steps,
    toolCalls,
    declaredTools,
  };
}
