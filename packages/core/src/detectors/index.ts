/**
 * The detector registry and the top-level `analyze()` entry point.
 *
 * Every detector is pure, deterministic TypeScript. No LLM is called — ever.
 * That is a design stance, not a shortcut: an observability product ingests
 * every run a customer makes, so detection has to be free or nobody runs it on
 * 100% of traffic. The model earns its keep after a flag is raised, never
 * before.
 */

import type { AnalysisResult, DetectorId, Finding, Trace } from "../types";
import { detectDroppedToolResult } from "./context";
import {
  detectEmptyResponse,
  detectRunError,
  detectStepError,
  detectTruncatedOutput,
} from "./output";
import {
  detectHallucinatedTool,
  detectSilentNoToolUse,
  detectToolError,
  detectToolLoop,
  detectToolOscillation,
} from "./tools";

export interface Detector {
  id: DetectorId;
  run: (trace: Trace) => Finding[];
}

export const DETECTORS: Detector[] = [
  { id: "dropped_tool_result", run: detectDroppedToolResult },
  { id: "hallucinated_tool", run: detectHallucinatedTool },
  { id: "empty_response", run: detectEmptyResponse },
  { id: "run_error", run: detectRunError },
  { id: "tool_loop", run: detectToolLoop },
  { id: "tool_oscillation", run: detectToolOscillation },
  { id: "tool_error", run: detectToolError },
  { id: "truncated_output", run: detectTruncatedOutput },
  { id: "step_error", run: detectStepError },
  { id: "silent_no_tool_use", run: detectSilentNoToolUse },
];

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 } as const;

export function analyze(trace: Trace): AnalysisResult {
  const findings = DETECTORS.flatMap((d) => d.run(trace)).sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );

  return {
    trace,
    findings,
    silentCount: findings.filter((f) => f.silent).length,
  };
}
