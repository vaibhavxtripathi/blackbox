/**
 * Custom Vitest matchers for asserting on agent behavior.
 *
 * A regression test is read exactly once: at 2am, by someone who did not write
 * it, when CI is red and they do not know what "oscillation" means. So the
 * failure messages here are the whole point of this file. Each one states what
 * was expected, what actually happened, and enough of the trace to act on —
 * without making anyone open the fixture.
 */

import { expect } from "vitest";
import type { Trace, NormalizedToolCall } from "./types";
import { tokenize } from "./detectors/context";

/** The object a replayed agent returns — see replay.ts. */
export interface ReplayResult {
  trace: Trace;
  response: string;
  toolCalls: NormalizedToolCall[];
}

function novelResultTokens(
  tc: NormalizedToolCall,
  prior: Set<string>
): string[] {
  if (tc.resultRaw === undefined) return [];
  const args = tc.argsRaw ? tokenize(tc.argsRaw) : new Set<string>();
  return [...tokenize(tc.resultRaw)].filter(
    (t) => !prior.has(t) && !args.has(t)
  );
}

interface MatcherState {
  isNot: boolean;
}

function pass(message: string) {
  return { pass: true, message: () => message };
}
function fail(message: string) {
  return { pass: false, message: () => message };
}

expect.extend({
  /**
   * Asserts a specific tool's novel output actually reached a later prompt.
   * This is the dropped_tool_result guard, phrased as an assertion.
   */
  toPassToolResultToModel(received: ReplayResult, toolName: string) {
    const { trace } = received;
    const prior = tokenize(
      [trace.userPrompt, trace.systemPrompt ?? ""].join(" ")
    );
    const promptTokens = tokenize(trace.steps.map((s) => s.prompt).join(" \n "));
    const calls = trace.toolCalls.filter((tc) => tc.name === toolName);

    if (calls.length === 0) {
      return fail(
        `Expected a "${toolName}" tool call to pass its result to the model, ` +
          `but no call to "${toolName}" exists in this run.`
      );
    }

    for (const tc of calls) {
      const novel = novelResultTokens(tc, prior);
      if (novel.length === 0) continue; // nothing new to thread; nothing to check
      const survived = novel.some((t) => promptTokens.has(t));
      if (!survived) {
        return fail(
          `Tool "${toolName}" (call ${tc.id}) succeeded and produced new ` +
            `information — ${novel.slice(0, 6).join(", ")} — but NONE of it ` +
            `reached any later prompt. The model answered without the tool's ` +
            `result.\n\n` +
            `    tool result : ${truncate(tc.resultRaw ?? "", 160)}\n` +
            `    final answer : ${truncate(trace.response, 160)}\n\n` +
            `This is context rot. The run reported status_code ${trace.statusCode}, ` +
            `so no metric caught it.`
        );
      }
    }
    return pass(`Expected "${toolName}" NOT to pass its result to the model.`);
  },

  toOnlyCallDeclaredTools(received: ReplayResult) {
    const { trace } = received;
    const declared = new Set(trace.declaredTools);
    const undeclared = trace.toolCalls
      .map((tc) => tc.name)
      .filter((n) => !declared.has(n));

    if (undeclared.length > 0) {
      return fail(
        `The agent called tool(s) that were never declared: ` +
          `${[...new Set(undeclared)].join(", ")}.\n` +
          `    declared : ${[...declared].join(", ") || "(none)"}\n` +
          `    called   : ${trace.toolCalls.map((t) => t.name).join(", ") || "(none)"}\n` +
          `The model invented a capability it was not given.`
      );
    }
    return pass(`Expected the agent to call an undeclared tool.`);
  },

  toHaveCalledToolAtMost(
    received: ReplayResult,
    toolName: string,
    max: number
  ) {
    const { trace } = received;
    const n = trace.toolCalls.filter((tc) => tc.name === toolName).length;
    if (n > max) {
      return fail(
        `Expected "${toolName}" to be called at most ${max}× but it was ` +
          `called ${n}×. Repeating the same call with identical arguments ` +
          `cannot produce new information — this is a loop.`
      );
    }
    return pass(`Expected "${toolName}" to exceed ${max} calls.`);
  },

  toHaveCalledTool(received: ReplayResult, toolName: string) {
    const { trace } = received;
    const called = trace.toolCalls.some((tc) => tc.name === toolName);
    if (!called) {
      return fail(
        `Expected the agent to call "${toolName}", but it was never called. ` +
          `Available tools: ${trace.declaredTools.join(", ") || "(none)"}. ` +
          `The agent may have answered "${truncate(trace.response, 80)}" from ` +
          `memory instead of consulting the tool.`
      );
    }
    return pass(`Expected "${toolName}" NOT to be called.`);
  },

  toHaveToolSucceeded(received: ReplayResult, toolName: string) {
    const { trace } = received;
    const failed = trace.toolCalls.filter(
      (tc) => tc.name === toolName && tc.statusCode === 2
    );
    if (failed.length > 0) {
      const f = failed[0]!;
      return fail(
        `Expected every "${toolName}" call to succeed, but call ${f.id} ` +
          `errored: ${f.statusMessage ?? "(no message)"}. The run still ` +
          `reported status_code ${trace.statusCode}, hiding the failure.`
      );
    }
    return pass(`Expected a "${toolName}" call to fail.`);
  },

  toHaveNonEmptyResponse(received: ReplayResult) {
    const { trace } = received;
    if (trace.response.trim().length === 0) {
      return fail(
        `Expected a non-empty response, but the run returned an empty body ` +
          `while reporting status_code ${trace.statusCode}. The purest silent ` +
          `failure: a question answered with nothing.`
      );
    }
    return pass(`Expected the response to be empty.`);
  },

  toHaveCompleteResponse(received: ReplayResult, stepId?: string) {
    const { trace } = received;
    const steps = stepId
      ? trace.steps.filter((s) => s.id === stepId)
      : trace.steps;
    const truncated = steps.find((s) => s.finishReason === "length");
    if (truncated) {
      return fail(
        `Expected step "${truncated.id}" to finish naturally, but it was cut ` +
          `off (finish_reason: length). Truncated output reads as complete ` +
          `while missing whatever came after the token limit:\n` +
          `    ${truncate(truncated.response, 160)}`
      );
    }
    return pass(`Expected a step to be truncated.`);
  },

  toHaveSucceeded(received: ReplayResult) {
    const { trace } = received;
    if (trace.statusCode !== 0) {
      return fail(
        `Expected the run to succeed, but it reported status_code ` +
          `${trace.statusCode}: ${trace.statusMessage ?? "(no message)"}.`
      );
    }
    return pass(`Expected the run to fail.`);
  },
});

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

interface BlackboxMatchers<R = unknown> {
  toPassToolResultToModel(toolName: string): R;
  toOnlyCallDeclaredTools(): R;
  toHaveCalledToolAtMost(toolName: string, max: number): R;
  toHaveCalledTool(toolName: string): R;
  toHaveToolSucceeded(toolName: string): R;
  toHaveNonEmptyResponse(): R;
  toHaveCompleteResponse(stepId?: string): R;
  toHaveSucceeded(): R;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends BlackboxMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends BlackboxMatchers {}
}

export type { MatcherState };
