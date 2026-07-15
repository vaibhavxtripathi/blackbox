/**
 * Integration tests against REAL SDK output.
 *
 * traces.json is not hand-written. It is produced by running the flaky agent
 * (examples/flaky-agent) against the published `@contextcompany/custom` SDK
 * with the transport pointed at a local capture server. These tests assert the
 * detectors behave correctly on genuinely SDK-serialized bytes — and, the money
 * assertion, that every broken run still reported status_code 0.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, normalize } from "../src/index";
import { replay } from "../src/replay";
import "../src/matchers";
import type { WireRunBundle } from "../src/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACES = resolve(__dirname, "../../../apps/web/app/data/traces.json");
const bundles: WireRunBundle[] = JSON.parse(readFileSync(TRACES, "utf8"));

// By construction: index 0 healthy, 1 dropped_context, 2 hallucinated,
// 3 looping, 4 truncated+errored, 5 confabulated.
const [healthy, dropped, hallucinated, looping, truncated, confab] = bundles;

function detectors(b: WireRunBundle) {
  return analyze(normalize(b)).findings.map((f) => f.detector);
}

describe("real SDK capture", () => {
  it("captured exactly six runs", () => {
    expect(bundles).toHaveLength(6);
  });

  it("uses the snake_case wire format (tool_name, not name)", () => {
    const withTool = bundles.find((b) => (b.toolCalls?.length ?? 0) > 0)!;
    expect(withTool.toolCalls![0]).toHaveProperty("tool_name");
  });
});

describe("detectors on real output", () => {
  it("healthy run produces ZERO findings", () => {
    expect(analyze(normalize(healthy!)).findings).toEqual([]);
  });

  it("dropped_context is caught", () => {
    expect(detectors(dropped!)).toContain("dropped_tool_result");
  });

  it("hallucinated_tool is caught", () => {
    expect(detectors(hallucinated!)).toContain("hallucinated_tool");
  });

  it("looping is caught as a tool_loop", () => {
    expect(detectors(looping!)).toContain("tool_loop");
  });

  it("truncated_and_errored is caught as BOTH tool_error and truncated_output", () => {
    const d = detectors(truncated!);
    expect(d).toContain("tool_error");
    expect(d).toContain("truncated_output");
  });

  it("confabulated is caught as silent_no_tool_use", () => {
    expect(detectors(confab!)).toContain("silent_no_tool_use");
  });
});

describe("the thesis: silent failures", () => {
  it("EVERY broken run still reported status_code 0", () => {
    const broken = [dropped, hallucinated, looping, truncated, confab];
    for (const b of broken) {
      expect(b!.status_code).toBe(0);
    }
  });

  it("dropped_context is silent despite being a critical failure", () => {
    const a = analyze(normalize(dropped!));
    const f = a.findings.find((x) => x.detector === "dropped_tool_result")!;
    expect(f.severity).toBe("critical");
    expect(f.silent).toBe(true);
  });

  it("every finding across broken runs is silent (nothing surfaced)", () => {
    for (const b of [dropped, hallucinated, looping, truncated, confab]) {
      const a = analyze(normalize(b!));
      expect(a.silentCount).toBe(a.findings.length);
      expect(a.findings.length).toBeGreaterThan(0);
    }
  });
});

describe("replay + matchers on real output", () => {
  it("the healthy run passes toPassToolResultToModel", () => {
    expect(replay(healthy!)).toPassToolResultToModel("get_weather");
  });

  it("the dropped run fails toPassToolResultToModel with a context-rot message", () => {
    expect(() =>
      expect(replay(dropped!)).toPassToolResultToModel("get_weather")
    ).toThrow(/context rot/i);
  });

  it("the confident -3 vs 15 confabulation is visible in the recorded bytes", () => {
    // The tool said -3 and snowing; the answer says 15 and sunny.
    const toolResult = dropped!.toolCalls![0]!.result!;
    expect(toolResult).toContain("-3");
    expect(dropped!.response).toContain("15");
  });
});
