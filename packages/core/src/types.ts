/**
 * Type definitions for Blackbox.
 *
 * Three layers live here:
 *
 * 1. The Context Company **wire format** — snake_case events exactly as the
 *    `@contextcompany/custom` SDK serializes them onto the transport. These are
 *    what we ingest. The step wire format is FLAT (`model_used`,
 *    `prompt_uncached_tokens`, ...), not nested — verified against the SDK
 *    source, contrary to what a casual reading of the docs suggests.
 * 2. A **normalized** representation (`Trace`) — ordered, tool-names resolved,
 *    tolerant of the two shapes the SDK can emit. Detectors only ever see this.
 * 3. **Findings** and declarative **Assertions** — what a detector produces and
 *    what codegen turns into a runnable test.
 */

// ---------------------------------------------------------------------------
// 1. Wire format (input) — snake_case, as sent by @contextcompany/custom
// ---------------------------------------------------------------------------

export interface WireRun {
  type: "run";
  run_id: string;
  session_id?: string;
  conversational?: boolean;
  prompt: { user_prompt: string; system_prompt?: string; full_input?: string };
  response?: string;
  full_output?: string;
  start_time: string;
  end_time: string;
  status_code: number;
  status_message?: string;
  metadata?: Record<string, string>;
}

export interface WireStep {
  type: "step";
  run_id: string;
  step_id: string;
  prompt: string;
  response: string;
  start_time: string;
  end_time: string;
  status_code: number;
  status_message?: string;
  model_requested?: string;
  model_used?: string;
  finish_reason?: string;
  prompt_uncached_tokens?: number;
  prompt_cached_tokens?: number;
  completion_tokens?: number;
  real_total_cost?: number;
  /** JSON-encoded array or record of tool schemas. */
  tool_definitions?: string;
}

export interface WireToolCall {
  type: "tool_call";
  run_id: string;
  tool_call_id: string;
  /**
   * The wire uses `tool_name`. The SDK's *input* type calls this `name`. We
   * accept both here and resolve to a guaranteed `name` in `normalize()`.
   */
  tool_name?: string;
  name?: string;
  start_time: string;
  end_time: string;
  status_code: number;
  status_message?: string;
  /** JSON-encoded arguments. */
  args?: string;
  /** JSON-encoded result. */
  result?: string;
}

export type WireEvent = WireRun | WireStep | WireToolCall;

/**
 * The shape the SDK's factory API (`sendRun`) accepts, which is also how we
 * store traces on disk: a run with its children nested underneath it.
 */
export interface WireRunBundle extends WireRun {
  steps?: WireStep[];
  toolCalls?: WireToolCall[];
}

// ---------------------------------------------------------------------------
// 2. Normalized representation — what every detector consumes
// ---------------------------------------------------------------------------

export type NodeKind = "step" | "tool_call";

export interface NormalizedStep {
  kind: "step";
  id: string;
  prompt: string;
  response: string;
  startTime: number;
  endTime: number;
  statusCode: number;
  statusMessage?: string;
  modelUsed?: string;
  finishReason?: string;
  /** Tool names the model was told it could call during this step. */
  declaredTools: string[];
}

export interface NormalizedToolCall {
  kind: "tool_call";
  id: string;
  /** Always present after normalization — resolved from `tool_name` or `name`. */
  name: string;
  startTime: number;
  endTime: number;
  statusCode: number;
  statusMessage?: string;
  /** Raw JSON string as sent; `undefined` if the tool reported no args. */
  argsRaw?: string;
  /** Parsed args, or `undefined` if absent / unparseable. */
  args?: Record<string, unknown>;
  /** Raw JSON string of the tool's return value. */
  resultRaw?: string;
}

export type TimelineNode = NormalizedStep | NormalizedToolCall;

export interface Trace {
  runId: string;
  sessionId?: string;
  userPrompt: string;
  systemPrompt?: string;
  response: string;
  startTime: number;
  endTime: number;
  statusCode: number;
  statusMessage?: string;
  /**
   * Steps and tool calls interleaved in start-time order, ties broken by the
   * order they arrived on the wire. Ordering is where failures live, so this
   * is the canonical structure detectors reason over.
   */
  timeline: TimelineNode[];
  steps: NormalizedStep[];
  toolCalls: NormalizedToolCall[];
  /** Union of every tool declared across all steps. */
  declaredTools: string[];
}

// ---------------------------------------------------------------------------
// 3. Findings + declarative assertions
// ---------------------------------------------------------------------------

export type Severity = "critical" | "high" | "medium";

export type DetectorId =
  | "dropped_tool_result"
  | "hallucinated_tool"
  | "empty_response"
  | "run_error"
  | "tool_loop"
  | "tool_oscillation"
  | "tool_error"
  | "truncated_output"
  | "step_error"
  | "silent_no_tool_use";

/**
 * A declarative assertion — a tagged union, deliberately NOT a raw code string.
 * Detectors describe *what* must hold; `codegen` owns *how* it renders. This
 * lets us retarget Jest or a hosted runner later without touching a detector.
 */
export type Assertion =
  | { kind: "passesToolResultToModel"; toolName: string; toolCallId: string }
  | { kind: "onlyCallsDeclaredTools"; declared: string[] }
  | { kind: "callsToolAtMost"; toolName: string; max: number }
  | { kind: "doesNotOscillate"; toolA: string; toolB: string }
  | { kind: "toolSucceeds"; toolName: string; toolCallId: string }
  | { kind: "stepSucceeds"; stepId: string }
  | { kind: "runSucceeds" }
  | { kind: "nonEmptyResponse" }
  | { kind: "completeResponse"; stepId: string }
  | { kind: "callsTool"; toolName: string };

export interface Finding {
  detector: DetectorId;
  severity: Severity;
  /**
   * A silent finding is one where the run reported `status_code: 0` — green to
   * every dashboard — despite the defect. This flag is the entire thesis.
   */
  silent: boolean;
  title: string;
  /** Human-readable explanation, rendered as the comment above the assertion. */
  detail: string;
  assertion: Assertion;
}

export interface AnalysisResult {
  trace: Trace;
  findings: Finding[];
  /** Count of findings that were invisible to status-code-based monitoring. */
  silentCount: number;
}
