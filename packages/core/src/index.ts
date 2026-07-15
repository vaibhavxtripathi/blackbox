/**
 * @blackbox/core — read a trace of a failed agent run, generate a regression
 * test that guarantees the failure never recurs.
 *
 * Detection is pure, deterministic TypeScript. No LLM is called, ever.
 */

export { normalize, extractDeclaredTools } from "./normalize";
export { analyze, DETECTORS } from "./detectors/index";
export { generateEval } from "./codegen";
export { tokenize } from "./detectors/context";

export type {
  WireRun,
  WireStep,
  WireToolCall,
  WireEvent,
  WireRunBundle,
  Trace,
  TimelineNode,
  NormalizedStep,
  NormalizedToolCall,
  Finding,
  Assertion,
  AnalysisResult,
  DetectorId,
  Severity,
} from "./types";
