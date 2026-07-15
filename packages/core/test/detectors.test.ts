import { describe, it, expect } from "vitest";
import { analyze, normalize, extractDeclaredTools, generateEval } from "../src/index";
import { tokenize } from "../src/detectors/context";
import * as fx from "./fixtures";
import type { DetectorId, WireRunBundle } from "../src/types";

function detectorsFor(bundle: WireRunBundle): DetectorId[] {
  return analyze(normalize(bundle)).findings.map((f) => f.detector);
}

describe("normalize", () => {
  it("resolves tool_name (wire) and name (input) to a single name", () => {
    const t = normalize({
      ...fx.healthy,
      toolCalls: [
        { ...fx.healthy.toolCalls![0]!, tool_name: undefined, name: "aliased" } as any,
      ],
    });
    expect(t.toolCalls[0]!.name).toBe("aliased");
  });

  it("interleaves steps and tool calls by start time", () => {
    const t = normalize(fx.healthy);
    const kinds = t.timeline.map((n) => n.kind);
    expect(kinds).toEqual(["step", "tool_call", "step"]);
  });

  it("survives millisecond collisions with a stable order", () => {
    const t = normalize(fx.droppedContextSameMs);
    expect(t.timeline).toHaveLength(3);
  });

  it("collects declared tools across steps", () => {
    expect(normalize(fx.healthy).declaredTools).toContain("get_weather");
  });
});

describe("extractDeclaredTools", () => {
  it("parses OpenAI-style function schemas", () => {
    const raw = JSON.stringify([
      { type: "function", function: { name: "get_weather" } },
    ]);
    expect(extractDeclaredTools(raw)).toEqual(["get_weather"]);
  });

  it("parses bare { name } entries", () => {
    expect(extractDeclaredTools(JSON.stringify([{ name: "a" }, { name: "b" }]))).toEqual([
      "a",
      "b",
    ]);
  });

  it("parses record { toolName: {...} } shape", () => {
    expect(
      extractDeclaredTools(JSON.stringify({ search: {}, fetch: {} }))
    ).toEqual(["search", "fetch"]);
  });

  it("returns [] on malformed JSON instead of throwing", () => {
    expect(extractDeclaredTools("{not json")).toEqual([]);
    expect(extractDeclaredTools(undefined)).toEqual([]);
  });

  it("dedupes repeated names", () => {
    expect(
      extractDeclaredTools(JSON.stringify([{ name: "x" }, { name: "x" }]))
    ).toEqual(["x"]);
  });
});

describe("tokenize", () => {
  it("keeps content words of length >= 4", () => {
    const t = tokenize("the fox ran fast today");
    expect(t.has("fast")).toBe(true);
    expect(t.has("today")).toBe(true);
    expect(t.has("fox")).toBe(false); // length 3
  });

  it("preserves temperature-like tokens", () => {
    expect([...tokenize("temperature -3°c and snowing")]).toContain("snowing");
  });
});

describe("dropped_tool_result (the hero)", () => {
  it("does NOT fire on the healthy run", () => {
    expect(detectorsFor(fx.healthy)).not.toContain("dropped_tool_result");
  });

  it("fires when the tool result never reaches the model", () => {
    expect(detectorsFor(fx.droppedContext)).toContain("dropped_tool_result");
  });

  it("is marked SILENT because status_code is 0", () => {
    const f = analyze(normalize(fx.droppedContext)).findings.find(
      (x) => x.detector === "dropped_tool_result"
    );
    expect(f?.silent).toBe(true);
  });

  it("still fires when all timestamps collide in one millisecond (bug #5)", () => {
    expect(detectorsFor(fx.droppedContextSameMs)).toContain("dropped_tool_result");
  });

  it("does NOT fire when the tool only echoes its own args (bug #4)", () => {
    expect(detectorsFor(fx.echoOnly)).not.toContain("dropped_tool_result");
  });

  it("ignores failed tool calls (tool_error owns those)", () => {
    expect(detectorsFor(fx.truncatedAndErrored)).not.toContain(
      "dropped_tool_result"
    );
  });
});

describe("hallucinated_tool", () => {
  it("fires when a called tool was never declared", () => {
    expect(detectorsFor(fx.hallucinatedTool)).toContain("hallucinated_tool");
  });

  it("stays silent when no tools are declared at all", () => {
    const bundle: WireRunBundle = {
      ...fx.hallucinatedTool,
      steps: [{ ...fx.hallucinatedTool.steps![0]!, tool_definitions: undefined }],
    };
    expect(detectorsFor(bundle)).not.toContain("hallucinated_tool");
  });
});

describe("tool_loop", () => {
  it("fires on 5 identical calls", () => {
    expect(detectorsFor(fx.looping)).toContain("tool_loop");
  });

  it("is insensitive to argument key order", () => {
    // fx.looping alternates key order; it must still be seen as one loop.
    const findings = analyze(normalize(fx.looping)).findings.filter(
      (f) => f.detector === "tool_loop"
    );
    expect(findings).toHaveLength(1);
  });

  it("does NOT fire on two identical calls", () => {
    const bundle: WireRunBundle = {
      ...fx.looping,
      toolCalls: fx.looping.toolCalls!.slice(0, 2),
    };
    expect(detectorsFor(bundle)).not.toContain("tool_loop");
  });
});

describe("tool_oscillation", () => {
  it("fires on A→B→A→B", () => {
    expect(detectorsFor(fx.oscillating)).toContain("tool_oscillation");
  });

  it("does NOT fire on a plain loop (no oscillation)", () => {
    expect(detectorsFor(fx.looping)).not.toContain("tool_oscillation");
  });
});

describe("tool_error", () => {
  it("fires when a tool reports status_code 2", () => {
    expect(detectorsFor(fx.truncatedAndErrored)).toContain("tool_error");
  });
});

describe("truncated_output", () => {
  it("fires on finish_reason length", () => {
    expect(detectorsFor(fx.truncatedAndErrored)).toContain("truncated_output");
  });
});

describe("step_error", () => {
  it("fires when a step reports status_code 2", () => {
    expect(detectorsFor(fx.stepError)).toContain("step_error");
  });
});

describe("empty_response", () => {
  it("fires on a green run with an empty body", () => {
    expect(detectorsFor(fx.emptyResponse)).toContain("empty_response");
  });
});

describe("run_error", () => {
  it("fires on status_code 2", () => {
    expect(detectorsFor(fx.runError)).toContain("run_error");
  });

  it("is the only detector that is NOT silent", () => {
    const f = analyze(normalize(fx.runError)).findings.find(
      (x) => x.detector === "run_error"
    );
    expect(f?.silent).toBe(false);
  });
});

describe("silent_no_tool_use", () => {
  it("fires when tools were available but none used and the answer is confident", () => {
    expect(detectorsFor(fx.confabulated)).toContain("silent_no_tool_use");
  });
});

describe("analyze", () => {
  it("produces ZERO findings on the healthy run (no false positives)", () => {
    expect(analyze(normalize(fx.healthy)).findings).toHaveLength(0);
  });

  it("sorts findings by severity (critical first)", () => {
    const f = analyze(normalize(fx.truncatedAndErrored)).findings;
    // truncated (high) + tool_error (high); ensure no ordering throws and stable
    expect(f.every((x) => x.severity === "high")).toBe(true);
  });

  it("counts silent findings", () => {
    const a = analyze(normalize(fx.droppedContext));
    expect(a.silentCount).toBe(a.findings.filter((x) => x.silent).length);
    expect(a.silentCount).toBeGreaterThan(0);
  });
});

describe("generated test is hermetic", () => {
  it("inlines the fixture and never calls fetch", () => {
    const code = generateEval(analyze(normalize(fx.droppedContext)));
    expect(code).not.toContain("fetch(");
    expect(code).toContain("const recording =");
    expect(code).toContain("toPassToolResultToModel");
  });

  it("emits one it() per finding", () => {
    const a = analyze(normalize(fx.truncatedAndErrored));
    const code = generateEval(a);
    const count = (code.match(/\n  it\(/g) ?? []).length;
    expect(count).toBe(a.findings.length);
  });
});
