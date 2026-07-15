/**
 * Hand-built wire bundles for unit tests. These mirror the SDK's on-disk shape
 * but are written explicitly so each detector can be exercised in isolation.
 * (The integration suite uses REAL SDK output instead — see integration.test.ts.)
 */

import type { WireRunBundle } from "../src/types";

const T0 = "2025-01-01T00:00:00.000Z";
const T1 = "2025-01-01T00:00:00.500Z";
const T2 = "2025-01-01T00:00:01.000Z";

function defs(names: string[]): string {
  return JSON.stringify(names.map((n) => ({ name: n })));
}

/** Healthy: the weather tool's result IS threaded into the follow-up prompt. */
export const healthy: WireRunBundle = {
  type: "run",
  run_id: "run_healthy",
  prompt: { user_prompt: "What's the weather in Oslo?" },
  response: "It's -3°C and snowing in Oslo.",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_healthy",
      step_id: "s1",
      prompt: "What's the weather in Oslo?",
      response: "Let me check.",
      start_time: T0,
      end_time: T1,
      status_code: 0,
      tool_definitions: defs(["get_weather"]),
    },
    {
      type: "step",
      run_id: "run_healthy",
      step_id: "s2",
      // The tool's novel output (temp -3, snowing) is present here.
      prompt: "Tool get_weather returned: temperature -3, condition snowing.",
      response: "It's -3°C and snowing in Oslo.",
      start_time: T2,
      end_time: T2,
      status_code: 0,
      tool_definitions: defs(["get_weather"]),
    },
  ],
  toolCalls: [
    {
      type: "tool_call",
      run_id: "run_healthy",
      tool_call_id: "tc1",
      tool_name: "get_weather",
      start_time: T1,
      end_time: T1,
      status_code: 0,
      args: JSON.stringify({ city: "Oslo" }),
      result: JSON.stringify({ city: "Oslo", temperature: -3, condition: "snowing" }),
    },
  ],
};

/** Dropped context: tool succeeds, result never reaches the model, model confabulates. */
export const droppedContext: WireRunBundle = {
  type: "run",
  run_id: "run_dropped",
  prompt: { user_prompt: "What's the weather in Oslo?" },
  response: "It's 15°C and sunny in Oslo.",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_dropped",
      step_id: "s1",
      prompt: "What's the weather in Oslo?",
      response: "Let me check.",
      start_time: T0,
      end_time: T1,
      status_code: 0,
      tool_definitions: defs(["get_weather"]),
    },
    {
      type: "step",
      run_id: "run_dropped",
      step_id: "s2",
      // The tool result is NOT here. Only the original question echoes forward.
      prompt: "The user asked about the weather in Oslo. Answer them.",
      response: "It's 15°C and sunny in Oslo.",
      start_time: T2,
      end_time: T2,
      status_code: 0,
      tool_definitions: defs(["get_weather"]),
    },
  ],
  toolCalls: [
    {
      type: "tool_call",
      run_id: "run_dropped",
      tool_call_id: "tc1",
      tool_name: "get_weather",
      start_time: T1,
      end_time: T1,
      status_code: 0,
      args: JSON.stringify({ city: "Oslo" }),
      result: JSON.stringify({ city: "Oslo", temperature: -3, condition: "snowing" }),
    },
  ],
};

/**
 * Dropped context with ALL timestamps collided into a single millisecond — the
 * bug #5 regression. A timestamp-ordering-based detector would find no "later"
 * step and false-positive on healthy runs / miss this one. Ours must still fire
 * because the novel result never appears in any prompt.
 */
export const droppedContextSameMs: WireRunBundle = {
  ...droppedContext,
  run_id: "run_dropped_samems",
  start_time: T0,
  end_time: T0,
  steps: droppedContext.steps!.map((s) => ({
    ...s,
    run_id: "run_dropped_samems",
    start_time: T0,
    end_time: T0,
  })),
  toolCalls: droppedContext.toolCalls!.map((tc) => ({
    ...tc,
    run_id: "run_dropped_samems",
    start_time: T0,
    end_time: T0,
  })),
};

/**
 * Echo case: the tool only echoes back the city it was given. There is no novel
 * information, so dropping it is not a failure. Must produce ZERO findings.
 */
export const echoOnly: WireRunBundle = {
  type: "run",
  run_id: "run_echo",
  prompt: { user_prompt: "Confirm the city Oslo." },
  response: "Confirmed: Oslo.",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_echo",
      step_id: "s1",
      prompt: "Confirm the city Oslo.",
      response: "Confirmed: Oslo.",
      start_time: T0,
      end_time: T2,
      status_code: 0,
      tool_definitions: defs(["confirm_city"]),
    },
  ],
  toolCalls: [
    {
      type: "tool_call",
      run_id: "run_echo",
      tool_call_id: "tc1",
      tool_name: "confirm_city",
      start_time: T1,
      end_time: T1,
      status_code: 0,
      args: JSON.stringify({ city: "Oslo" }),
      result: JSON.stringify({ city: "Oslo" }),
    },
  ],
};

export const hallucinatedTool: WireRunBundle = {
  type: "run",
  run_id: "run_hallucinated",
  prompt: { user_prompt: "Book me a hotel in Tokyo." },
  response: "Booked!",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_hallucinated",
      step_id: "s1",
      prompt: "Book me a hotel in Tokyo.",
      response: "Booking.",
      start_time: T0,
      end_time: T1,
      status_code: 0,
      tool_definitions: defs(["search_flights"]),
    },
  ],
  toolCalls: [
    {
      type: "tool_call",
      run_id: "run_hallucinated",
      tool_call_id: "tc1",
      tool_name: "book_hotel",
      start_time: T1,
      end_time: T1,
      status_code: 0,
      args: JSON.stringify({ city: "Tokyo" }),
      result: JSON.stringify({ confirmation: "abc" }),
    },
  ],
};

export const looping: WireRunBundle = {
  type: "run",
  run_id: "run_loop",
  prompt: { user_prompt: "Find flights to Tokyo." },
  response: "Searching…",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_loop",
      step_id: "s1",
      prompt: "Find flights to Tokyo.",
      response: "Searching.",
      start_time: T0,
      end_time: T1,
      status_code: 0,
      tool_definitions: defs(["search_flights"]),
    },
  ],
  toolCalls: Array.from({ length: 5 }, (_, i) => ({
    type: "tool_call" as const,
    run_id: "run_loop",
    tool_call_id: `tc${i}`,
    tool_name: "search_flights",
    start_time: T1,
    end_time: T1,
    status_code: 0,
    // Same args, keys in DIFFERENT order, to prove key-order insensitivity.
    args:
      i % 2 === 0
        ? JSON.stringify({ dest: "Tokyo", cabin: "economy" })
        : JSON.stringify({ cabin: "economy", dest: "Tokyo" }),
    result: JSON.stringify({ flights: [] }),
  })),
};

export const oscillating: WireRunBundle = {
  type: "run",
  run_id: "run_osc",
  prompt: { user_prompt: "Plan my trip." },
  response: "Planning…",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_osc",
      step_id: "s1",
      prompt: "Plan my trip.",
      response: "Planning.",
      start_time: T0,
      end_time: T1,
      status_code: 0,
      tool_definitions: defs(["add_to_cart", "remove_from_cart"]),
    },
  ],
  toolCalls: ["add_to_cart", "remove_from_cart", "add_to_cart", "remove_from_cart"].map(
    (name, i) => ({
      type: "tool_call" as const,
      run_id: "run_osc",
      tool_call_id: `tc${i}`,
      tool_name: name,
      start_time: T1,
      end_time: T1,
      status_code: 0,
      args: JSON.stringify({ item: `item${i}` }),
      result: JSON.stringify({ ok: true }),
    })
  ),
};

export const truncatedAndErrored: WireRunBundle = {
  type: "run",
  run_id: "run_trunc",
  prompt: { user_prompt: "Summarize the report." },
  response: "The report shows that",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_trunc",
      step_id: "s1",
      prompt: "Summarize the report.",
      response: "The report shows that",
      start_time: T0,
      end_time: T1,
      status_code: 0,
      finish_reason: "length",
      tool_definitions: defs(["fetch_report"]),
    },
  ],
  toolCalls: [
    {
      type: "tool_call",
      run_id: "run_trunc",
      tool_call_id: "tc1",
      tool_name: "fetch_report",
      start_time: T1,
      end_time: T1,
      status_code: 2,
      status_message: "503 Service Unavailable",
      args: JSON.stringify({ id: "r1" }),
    },
  ],
};

export const confabulated: WireRunBundle = {
  type: "run",
  run_id: "run_confab",
  prompt: { user_prompt: "What's the weather in Paris right now?" },
  response: "It's currently 22°C and sunny in Paris.",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_confab",
      step_id: "s1",
      prompt: "What's the weather in Paris right now?",
      response: "It's currently 22°C and sunny in Paris.",
      start_time: T0,
      end_time: T2,
      status_code: 0,
      tool_definitions: defs(["get_weather"]),
    },
  ],
  toolCalls: [],
};

export const emptyResponse: WireRunBundle = {
  type: "run",
  run_id: "run_empty",
  prompt: { user_prompt: "Help me." },
  response: "   ",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [],
  toolCalls: [],
};

export const runError: WireRunBundle = {
  type: "run",
  run_id: "run_err",
  prompt: { user_prompt: "Do the thing." },
  response: "",
  start_time: T0,
  end_time: T2,
  status_code: 2,
  status_message: "Upstream timeout",
  steps: [],
  toolCalls: [],
};

export const stepError: WireRunBundle = {
  type: "run",
  run_id: "run_steperr",
  prompt: { user_prompt: "Analyze." },
  response: "Done.",
  start_time: T0,
  end_time: T2,
  status_code: 0,
  steps: [
    {
      type: "step",
      run_id: "run_steperr",
      step_id: "s1",
      prompt: "Analyze.",
      response: "",
      start_time: T0,
      end_time: T1,
      status_code: 2,
      status_message: "model overloaded",
    },
  ],
  toolCalls: [],
};
