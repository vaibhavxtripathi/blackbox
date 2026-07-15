/**
 * ★ dropped_tool_result — the hero detector.
 *
 * A tool call succeeds. The run reports status_code 0. Every dashboard is
 * green. But the tool's output was never threaded into a later prompt, so the
 * model answered from memory — which is to say, it made something up. This is
 * context rot made executable.
 *
 * Two bugs make the naive version silently wrong, and both are guarded here:
 *
 *   The ECHO false-negative (bug #4). Tools echo their own arguments back:
 *   get_weather({city:"Oslo"}) -> {city:"Oslo", temp:-3}. "Oslo" came from the
 *   user, so a substring check always "finds" it and the detector never fires.
 *   Fix: consider only NOVEL tokens — those in the result but not in the user
 *   prompt, system prompt, or the tool's own arguments. We ask whether the
 *   genuinely new information survived, nothing else.
 *
 *   The MILLISECOND-COLLISION false-positive (bug #5). A "look only at steps
 *   that start after the tool ends" implementation finds zero later steps when
 *   the SDK stamps the tool call and the next step in the same millisecond —
 *   and fires on a perfectly healthy run. Fix: the detector is
 *   timestamp-independent. We ask whether the novel output appears in ANY
 *   prompt the model was ever given, a question ordering cannot corrupt.
 */

import type { Finding, NormalizedToolCall, Trace } from "../types";

/** Content words of length >= 4, lowercased. Punctuation and digits-with-units survive as-is. */
export function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9°.+-]+/i)
    .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ""))
    .filter((t) => t.length >= 4);
  return new Set(tokens);
}

/** Tokens present in `result` but absent from every source the model already had. */
function novelTokens(
  tc: NormalizedToolCall,
  priorContext: Set<string>
): Set<string> {
  if (tc.resultRaw === undefined) return new Set();
  const resultTokens = tokenize(tc.resultRaw);
  const argTokens = tc.argsRaw ? tokenize(tc.argsRaw) : new Set<string>();
  const novel = new Set<string>();
  for (const tok of resultTokens) {
    if (!priorContext.has(tok) && !argTokens.has(tok)) novel.add(tok);
  }
  return novel;
}

export function detectDroppedToolResult(trace: Trace): Finding[] {
  const findings: Finding[] = [];

  // Everything the model was ever handed: the user + system prompt, plus every
  // step prompt AND response (a later step's prompt often quotes an earlier
  // response). Timestamp-independent by construction.
  const priorContext = tokenize(
    [trace.userPrompt, trace.systemPrompt ?? ""].join(" ")
  );

  const allPromptText = trace.steps.map((s) => s.prompt).join(" \n ");
  const promptTokens = tokenize(allPromptText);

  for (const tc of trace.toolCalls) {
    // Only successful tool calls can *silently* drop context. A failed tool is
    // caught by tool_error; there's nothing to thread through.
    if (tc.statusCode !== 0) continue;
    if (tc.resultRaw === undefined) continue;

    const novel = novelTokens(tc, priorContext);
    if (novel.size === 0) continue; // Tool returned nothing the model didn't already know.

    // Did ANY genuinely-new token reach ANY prompt the model saw?
    let survived = false;
    for (const tok of novel) {
      if (promptTokens.has(tok)) {
        survived = true;
        break;
      }
    }
    if (survived) continue;

    const sample = [...novel].slice(0, 4).join(", ");
    findings.push({
      detector: "dropped_tool_result",
      severity: "critical",
      silent: trace.statusCode === 0,
      title: `Tool "${tc.name}" succeeded but its result never reached the model`,
      detail:
        `The tool call "${tc.name}" returned successfully, yet none of the new ` +
        `information it produced (e.g. ${sample}) appears in any prompt the ` +
        `model was subsequently given. The model answered without it — the ` +
        `output was dropped between the tool and the next inference. This is ` +
        `context rot: the run is green, but the answer is built on nothing.`,
      assertion: {
        kind: "passesToolResultToModel",
        toolName: tc.name,
        toolCallId: tc.id,
      },
    });
  }

  return findings;
}
