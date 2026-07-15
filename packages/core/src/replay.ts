/**
 * The hermetic replay harness.
 *
 * A regression test asserts on the agent's *reasoning*, so the world it reasons
 * about must be held fixed. `replay()` reconstructs a `Trace` from a recording
 * and exposes a Proxy tool bag that serves each recorded tool response by name.
 *
 * The contract is strict on purpose:
 *   - A tool that failed in production fails in replay with the same message.
 *   - A tool the recording never saw throws loudly — never returns `undefined`,
 *     which would let a broken agent quietly pass.
 */

import { normalize } from "./normalize";
import type {
  NormalizedToolCall,
  Trace,
  WireRunBundle,
} from "./types";

export interface ReplayHandle {
  trace: Trace;
  response: string;
  toolCalls: NormalizedToolCall[];
  /**
   * A Proxy keyed by tool name. Reading `tools.get_weather` returns a function
   * that yields the recorded result (parsed) or throws the recorded error.
   */
  tools: Record<string, () => unknown>;
}

class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

function makeToolBag(trace: Trace): Record<string, () => unknown> {
  // Group recorded calls by name; successive calls to the same tool replay in
  // recorded order.
  const byName = new Map<string, NormalizedToolCall[]>();
  for (const tc of trace.toolCalls) {
    const list = byName.get(tc.name) ?? [];
    list.push(tc);
    byName.set(tc.name, list);
  }
  const cursors = new Map<string, number>();

  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        return () => {
          const calls = byName.get(prop);
          if (!calls || calls.length === 0) {
            throw new ReplayError(
              `Agent called undeclared/unrecorded tool "${prop}". The ` +
                `recording contains no such call, so there is no response to ` +
                `replay. This is the hallucinated-tool case surfacing at ` +
                `replay time.`
            );
          }
          const i = cursors.get(prop) ?? 0;
          const call = calls[Math.min(i, calls.length - 1)]!;
          cursors.set(prop, i + 1);

          if (call.statusCode === 2) {
            throw new ReplayError(
              `Tool "${prop}" failed in the recording: ` +
                `${call.statusMessage ?? "(no message)"}. Replay reproduces the ` +
                `same failure so the test exercises the real fault path.`
            );
          }

          if (call.resultRaw === undefined) return undefined;
          try {
            return JSON.parse(call.resultRaw);
          } catch {
            return call.resultRaw;
          }
        };
      },
    }
  );
}

export function replay(bundle: WireRunBundle): ReplayHandle {
  const trace = normalize(bundle);
  return {
    trace,
    response: trace.response,
    toolCalls: trace.toolCalls,
    tools: makeToolBag(trace),
  };
}
