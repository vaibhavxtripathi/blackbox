/**
 * Output- and run-level detectors: empty responses, truncation, and errors at
 * the step or run level.
 */

import type { Finding, Trace } from "../types";

export function detectEmptyResponse(trace: Trace): Finding[] {
  // The purest silent failure: the run says success and hands back nothing.
  if (trace.statusCode !== 0) return [];
  if (trace.response.trim().length > 0) return [];

  return [
    {
      detector: "empty_response",
      severity: "critical",
      silent: true,
      title: "Run succeeded with an empty response",
      detail:
        "The run reported status_code 0 but the final response body is empty. " +
        "A user asked a question and received nothing, and no metric registered " +
        "a problem.",
      assertion: { kind: "nonEmptyResponse" },
    },
  ];
}

export function detectTruncatedOutput(trace: Trace): Finding[] {
  const findings: Finding[] = [];
  for (const step of trace.steps) {
    if (step.finishReason !== "length") continue;
    findings.push({
      detector: "truncated_output",
      severity: "high",
      silent: trace.statusCode === 0,
      title: `Step "${step.id}" was truncated (finish_reason: length)`,
      detail:
        "The model hit its token limit and stopped mid-generation " +
        "(finish_reason: length). The output can be cut off mid-fact while " +
        "still reading as a complete, confident answer.",
      assertion: { kind: "completeResponse", stepId: step.id },
    });
  }
  return findings;
}

export function detectStepError(trace: Trace): Finding[] {
  const findings: Finding[] = [];
  for (const step of trace.steps) {
    if (step.statusCode !== 2) continue;
    findings.push({
      detector: "step_error",
      severity: "high",
      silent: trace.statusCode === 0,
      title: `LLM step "${step.id}" errored`,
      detail:
        `An LLM step reported status_code 2` +
        (step.statusMessage ? `: ${step.statusMessage}` : "") +
        `. A failed inference inside a run the dashboard still counts as green.`,
      assertion: { kind: "stepSucceeds", stepId: step.id },
    });
  }
  return findings;
}

export function detectRunError(trace: Trace): Finding[] {
  // The only loud detector — this failure DID surface. We still assert on it so
  // the generated test is complete, but it is not silent.
  if (trace.statusCode !== 2) return [];
  return [
    {
      detector: "run_error",
      severity: "critical",
      silent: false,
      title: "Run failed",
      detail:
        `The run reported status_code 2` +
        (trace.statusMessage ? `: ${trace.statusMessage}` : "") +
        `. This one was visible to monitoring — the regression test pins it so ` +
        `it stays fixed.`,
      assertion: { kind: "runSucceeds" },
    },
  ];
}
