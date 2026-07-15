import { describe, it, expect } from "vitest";
import { replay } from "../src/replay";
import "../src/matchers";
import * as fx from "./fixtures";

describe("replay harness", () => {
  it("serves recorded tool results by name", () => {
    const h = replay(fx.healthy);
    const result = h.tools.get_weather!() as Record<string, unknown>;
    expect(result.temperature).toBe(-3);
  });

  it("throws loudly on an unrecorded tool instead of returning undefined", () => {
    const h = replay(fx.healthy);
    expect(() => h.tools.nonexistent!()).toThrow(/unrecorded tool/);
  });

  it("reproduces a recorded tool failure with the same message", () => {
    const h = replay(fx.truncatedAndErrored);
    expect(() => h.tools.fetch_report!()).toThrow(/503/);
  });
});

describe("custom matchers", () => {
  it("toPassToolResultToModel passes on the healthy run", () => {
    expect(replay(fx.healthy)).toPassToolResultToModel("get_weather");
  });

  it("toPassToolResultToModel fails on the dropped-context run", () => {
    expect(() =>
      expect(replay(fx.droppedContext)).toPassToolResultToModel("get_weather")
    ).toThrow(/context rot/i);
  });

  it("toOnlyCallDeclaredTools fails on a hallucinated tool", () => {
    expect(() =>
      expect(replay(fx.hallucinatedTool)).toOnlyCallDeclaredTools()
    ).toThrow(/never declared/i);
  });

  it("toHaveCalledToolAtMost fails on a loop", () => {
    expect(() =>
      expect(replay(fx.looping)).toHaveCalledToolAtMost("search_flights", 2)
    ).toThrow(/loop/i);
  });

  it("toHaveToolSucceeded fails on an errored tool", () => {
    expect(() =>
      expect(replay(fx.truncatedAndErrored)).toHaveToolSucceeded("fetch_report")
    ).toThrow(/errored/i);
  });

  it("toHaveNonEmptyResponse fails on an empty body", () => {
    expect(() =>
      expect(replay(fx.emptyResponse)).toHaveNonEmptyResponse()
    ).toThrow(/empty/i);
  });

  it("toHaveCompleteResponse fails on truncation", () => {
    expect(() =>
      expect(replay(fx.truncatedAndErrored)).toHaveCompleteResponse()
    ).toThrow(/cut off/i);
  });

  it("toHaveCalledTool fails when a confident answer skipped the tool", () => {
    expect(() =>
      expect(replay(fx.confabulated)).toHaveCalledTool("get_weather")
    ).toThrow(/never called/i);
  });

  it("toHaveSucceeded fails on a run error", () => {
    expect(() => expect(replay(fx.runError)).toHaveSucceeded()).toThrow(
      /status_code 2/
    );
  });
});
