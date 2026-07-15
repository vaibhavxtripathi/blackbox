/**
 * Tool-behavior detectors: hallucinated calls, loops, oscillation, tool
 * errors, and the confident no-tool-use case.
 */

import type { Finding, NormalizedToolCall, Trace } from "../types";

/** Stable key for "same call": name + args with keys sorted so key order can't hide a loop. */
function callKey(tc: NormalizedToolCall): string {
  if (tc.args) {
    const sorted = Object.keys(tc.args)
      .sort()
      .map((k) => `${k}=${JSON.stringify(tc.args![k])}`)
      .join("&");
    return `${tc.name}(${sorted})`;
  }
  return `${tc.name}(${tc.argsRaw ?? ""})`;
}

export function detectHallucinatedTool(trace: Trace): Finding[] {
  // If the agent declared no tools at all, we can't distinguish a hallucination
  // from an un-instrumented tool layer. Stay silent rather than false-positive.
  if (trace.declaredTools.length === 0) return [];

  const findings: Finding[] = [];
  const declared = new Set(trace.declaredTools);
  const seen = new Set<string>();

  for (const tc of trace.toolCalls) {
    if (declared.has(tc.name) || seen.has(tc.name)) continue;
    seen.add(tc.name);
    findings.push({
      detector: "hallucinated_tool",
      severity: "critical",
      silent: trace.statusCode === 0,
      title: `Model called undeclared tool "${tc.name}"`,
      detail:
        `The model invoked "${tc.name}", which was never listed in any step's ` +
        `tool_definitions (declared: ${[...declared].join(", ") || "none"}). ` +
        `The model invented a capability it was never given.`,
      assertion: {
        kind: "onlyCallsDeclaredTools",
        declared: [...declared],
      },
    });
  }

  return findings;
}

export function detectToolLoop(trace: Trace): Finding[] {
  const counts = new Map<string, { tc: NormalizedToolCall; n: number }>();
  for (const tc of trace.toolCalls) {
    const key = callKey(tc);
    const entry = counts.get(key);
    if (entry) entry.n += 1;
    else counts.set(key, { tc, n: 1 });
  }

  const findings: Finding[] = [];
  for (const { tc, n } of counts.values()) {
    if (n < 3) continue;
    findings.push({
      detector: "tool_loop",
      severity: "high",
      silent: trace.statusCode === 0,
      title: `Tool "${tc.name}" called ${n}× with identical arguments`,
      detail:
        `"${tc.name}" was invoked ${n} times with the same arguments ` +
        `(${tc.argsRaw ?? "no args"}). Repeating an identical call cannot ` +
        `yield new information — the agent is stuck in a loop.`,
      assertion: { kind: "callsToolAtMost", toolName: tc.name, max: 2 },
    });
  }
  return findings;
}

export function detectToolOscillation(trace: Trace): Finding[] {
  // A -> B -> A -> B: distinct from a loop (no single call repeats 3×), so a
  // count check can't see it. Walk the tool-call sequence for A,B,A,B windows.
  const names = trace.toolCalls.map((tc) => tc.name);
  const findings: Finding[] = [];
  const reported = new Set<string>();

  for (let i = 0; i + 3 < names.length + 1 && i + 3 <= names.length; i++) {
    const [a, b, c, d] = [names[i], names[i + 1], names[i + 2], names[i + 3]];
    if (a === undefined || b === undefined) continue;
    if (a !== b && a === c && b === d) {
      const key = [a, b].sort().join("|");
      if (reported.has(key)) continue;
      reported.add(key);
      findings.push({
        detector: "tool_oscillation",
        severity: "high",
        silent: trace.statusCode === 0,
        title: `Tools "${a}" and "${b}" oscillate`,
        detail:
          `The agent alternated ${a} → ${b} → ${a} → ${b}. Two tools ` +
          `undoing or re-triggering each other is a control-flow failure a ` +
          `simple repeat-count check would miss.`,
        assertion: { kind: "doesNotOscillate", toolA: a, toolB: b },
      });
    }
  }
  return findings;
}

export function detectToolError(trace: Trace): Finding[] {
  const findings: Finding[] = [];
  for (const tc of trace.toolCalls) {
    if (tc.statusCode !== 2) continue;
    findings.push({
      detector: "tool_error",
      severity: "high",
      silent: trace.statusCode === 0,
      title: `Tool "${tc.name}" errored`,
      detail:
        `"${tc.name}" reported status_code 2` +
        (tc.statusMessage ? `: ${tc.statusMessage}` : "") +
        `. The tool failed, but the run itself did not — the failure was ` +
        `swallowed downstream.`,
      assertion: { kind: "toolSucceeds", toolName: tc.name, toolCallId: tc.id },
    });
  }
  return findings;
}

export function detectSilentNoToolUse(trace: Trace): Finding[] {
  // Advisory. Tools were available, none were called, and the agent still
  // produced a confident, non-trivial answer. Often fine — sometimes memory.
  if (trace.declaredTools.length === 0) return [];
  if (trace.toolCalls.length > 0) return [];
  if (trace.response.trim().length < 20) return [];

  return [
    {
      detector: "silent_no_tool_use",
      severity: "medium",
      silent: trace.statusCode === 0,
      title: `Answered confidently without using any of ${trace.declaredTools.length} available tool(s)`,
      detail:
        `Tools were declared (${trace.declaredTools.join(", ")}) but none were ` +
        `called, yet the agent returned a substantive answer. If the question ` +
        `required current data, this answer came from the model's memory. ` +
        `Advisory — verify the answer did not need a tool.`,
      assertion: {
        kind: "callsTool",
        toolName: trace.declaredTools[0] ?? "",
      },
    },
  ];
}
