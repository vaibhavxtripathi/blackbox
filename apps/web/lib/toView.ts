/**
 * Maps a raw wire bundle to the serializable RunView the UI renders.
 *
 * This is deliberately isolated from any React or Next specifics so BOTH the
 * server component (the six demo runs, analyzed at build time) and the client
 * "analyze your own trace" box import the exact same code path. When a visitor
 * pastes a trace, the identical detectors run in their browser — nothing is
 * pre-computed, nothing is mocked.
 */

import { analyze, normalize, generateEval } from "@blackbox/core";
import type { WireRunBundle, Trace, Finding } from "@blackbox/core";
import type { RunView } from "../components/ui";

const LABELS = [
  "healthy",
  "dropped-context",
  "hallucinated-tool",
  "looping",
  "truncated+errored",
  "confabulated",
];

export function labelFor(trace: Trace, i: number): string {
  return LABELS[i] ?? trace.userPrompt.slice(0, 24) ?? `run ${i}`;
}

/** Which timeline nodes a finding implicates, for red-tinting the rows. */
function flagReasonFor(
  node: { kind: string; id: string; name?: string; statusCode: number },
  findings: Finding[]
): string | undefined {
  for (const f of findings) {
    const a = f.assertion;
    if (node.kind === "tool_call") {
      if (a.kind === "passesToolResultToModel" && a.toolCallId === node.id)
        return f.title;
      if (a.kind === "toolSucceeds" && a.toolCallId === node.id) return f.title;
      if (
        a.kind === "onlyCallsDeclaredTools" &&
        node.name &&
        !a.declared.includes(node.name)
      )
        return f.title;
      if (a.kind === "callsToolAtMost" && a.toolName === node.name)
        return f.title;
      if (node.statusCode === 2) return f.title;
    }
    if (node.kind === "step") {
      if (a.kind === "completeResponse" && a.stepId === node.id) return f.title;
      if (a.kind === "stepSucceeds" && a.stepId === node.id) return f.title;
      if (node.statusCode === 2) return f.title;
    }
  }
  return undefined;
}

export function toView(
  bundle: WireRunBundle,
  i: number,
  labelOverride?: string
): RunView {
  const trace = normalize(bundle);
  const analysis = analyze(trace);
  const erroredSpans =
    trace.steps.filter((s) => s.statusCode === 2).length +
    trace.toolCalls.filter((t) => t.statusCode === 2).length;

  const timeline = trace.timeline.map((n) => {
    const reason = flagReasonFor(n, analysis.findings);
    if (n.kind === "tool_call") {
      const args = n.argsRaw ? ` ${n.argsRaw}` : "";
      const res = n.resultRaw ? ` → ${n.resultRaw}` : "";
      return {
        kind: "tool_call" as const,
        name: n.name + "()",
        meta: (args + res).trim() || "(no args)",
        statusCode: n.statusCode,
        flagged: reason !== undefined,
        ...(reason ? { flagReason: reason } : {}),
      };
    }
    return {
      kind: "step" as const,
      name: n.modelUsed ? `LLM step · ${n.modelUsed}` : "LLM step",
      meta:
        `prompt: ${n.prompt.slice(0, 110)}` +
        (n.finishReason ? `  ·  finish: ${n.finishReason}` : ""),
      statusCode: n.statusCode,
      flagged: reason !== undefined,
      ...(reason ? { flagReason: reason } : {}),
    };
  });

  return {
    id: trace.runId,
    label: labelOverride ?? labelFor(trace, i),
    ok: analysis.findings.length === 0,
    vitals: {
      statusCode: trace.statusCode,
      statusLabel: trace.statusCode === 0 ? "200 OK" : "error",
      latencyMs: Math.max(1, trace.endTime - trace.startTime),
      erroredSpans,
      tokens: trace.steps.length * 150,
      toolCalls: trace.toolCalls.length,
    },
    findingCount: analysis.findings.length,
    silentCount: analysis.silentCount,
    findings: analysis.findings.map((f) => ({
      detector: f.detector,
      severity: f.severity,
      silent: f.silent,
      title: f.title,
      detail: f.detail,
    })),
    timeline,
    code: analysis.findings.length ? generateEval(analysis) : "",
  };
}

/**
 * Normalize arbitrary pasted input into a list of run bundles.
 * Accepts: a single run bundle, an array of bundles, a flat { type:"batch",
 * items:[...] } envelope, or a bare array of wire events — the shapes a real
 * SDK user is likely to have on hand. Throws a friendly error otherwise.
 */
export function parseInput(raw: string): WireRunBundle[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      "That isn't valid JSON. Check for a trailing comma or a stray quote."
    );
  }

  // Batch envelope or bare event array → re-nest by run_id.
  const asBatch =
    json && typeof json === "object" && (json as any).type === "batch"
      ? (json as any).items
      : Array.isArray(json) &&
          (json as any[]).every((e) => e?.type && e?.run_id)
        ? json
        : null;

  if (asBatch) return nestEvents(asBatch as any[]);

  // Array of already-nested bundles.
  if (Array.isArray(json)) {
    if (json.length === 0)
      throw new Error("The array is empty — no runs to analyze.");
    return json as WireRunBundle[];
  }

  // Single bundle.
  if (json && typeof json === "object" && (json as any).type === "run") {
    return [json as WireRunBundle];
  }

  throw new Error(
    "Unrecognized shape. Expected a run bundle, an array of runs, or a { type:'batch', items:[...] } envelope."
  );
}

function nestEvents(events: any[]): WireRunBundle[] {
  const runs = new Map<string, any>();
  const order: string[] = [];
  for (const e of events) {
    if (e.type !== "run") continue;
    runs.set(e.run_id, { ...e, steps: [], toolCalls: [] });
    order.push(e.run_id);
  }
  for (const e of events) {
    const b = runs.get(e.run_id);
    if (!b) continue;
    if (e.type === "step") b.steps.push(e);
    else if (e.type === "tool_call") b.toolCalls.push(e);
  }
  if (order.length === 0) throw new Error("No run events found in the batch.");
  return order.map((id) => runs.get(id));
}
