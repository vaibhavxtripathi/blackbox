"use client";

import { useState } from "react";
import { RunPanels, type RunView } from "./ui";
import { toView, parseInput } from "../lib/toView";

/**
 * The "analyze your own trace" box. Everything here runs in the visitor's
 * browser — parseInput + the @blackbox/core detectors + codegen — so this is a
 * genuine test surface, not a replay of pre-baked results. Paste a trace, watch
 * the real engine react.
 */

// A minimal, editable starting point. The tool says one thing (-3, snowing);
// the model answers another (15, sunny). Edit either and re-run to see the
// verdict flip.
const EXAMPLE = `{
  "type": "run",
  "run_id": "my-run-001",
  "prompt": { "user_prompt": "What's the weather in Oslo right now?" },
  "response": "It's 15°C and sunny in Oslo.",
  "start_time": "2025-01-01T00:00:00.000Z",
  "end_time": "2025-01-01T00:00:01.000Z",
  "status_code": 0,
  "steps": [
    {
      "type": "step", "run_id": "my-run-001", "step_id": "s1",
      "prompt": "The user asked for the weather in Oslo. Answer them.",
      "response": "It's 15°C and sunny in Oslo.",
      "start_time": "2025-01-01T00:00:00.600Z",
      "end_time": "2025-01-01T00:00:01.000Z",
      "status_code": 0,
      "tool_definitions": "[{\\"name\\":\\"get_weather\\"}]"
    }
  ],
  "toolCalls": [
    {
      "type": "tool_call", "run_id": "my-run-001", "tool_call_id": "tc1",
      "tool_name": "get_weather",
      "start_time": "2025-01-01T00:00:00.100Z",
      "end_time": "2025-01-01T00:00:00.500Z",
      "status_code": 0,
      "args": "{\\"city\\":\\"Oslo\\"}",
      "result": "{\\"city\\":\\"Oslo\\",\\"temperature\\":-3,\\"condition\\":\\"snowing\\"}"
    }
  ]
}`;

export function Analyzer() {
  const [text, setText] = useState("");
  const [views, setViews] = useState<RunView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(source: string) {
    setError(null);
    try {
      const bundles = parseInput(source);
      // Real detectors, real codegen, right here in the browser.
      const out = bundles.map((b, i) => toView(b, i, b.run_id ?? `run ${i}`));
      setViews(out);
    } catch (e) {
      setViews(null);
      setError(
        e instanceof Error ? e.message : "Could not analyze that input."
      );
    }
  }

  return (
    <>
      <div className="section-label">Analyze your own trace</div>
      <div className="analyzer">
        <p className="analyzer-hint">
          Paste a trace your agent produced — a single run, an array of runs, or
          the raw <code>{`{ type:"batch", items:[…] }`}</code> your SDK puts on
          the wire. The detectors run <b>in your browser</b>. Nothing is
          uploaded; nothing is pre-computed.
        </p>
        <textarea
          className="analyzer-input mono"
          placeholder="Paste trace JSON here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        <div className="analyzer-actions">
          <button
            className="btn btn-primary"
            onClick={() => run(text)}
            disabled={text.trim().length === 0}
          >
            Analyze ▸
          </button>
          <button
            className="btn"
            onClick={() => {
              setText(EXAMPLE);
              run(EXAMPLE);
            }}
          >
            Load an example
          </button>
          {(views || error) && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setText("");
                setViews(null);
                setError(null);
              }}
            >
              Clear
            </button>
          )}
          <span className="analyzer-note">
            Tip: the example fails because the tool’s result (
            <b>-3°C, snowing</b>) never appears in the step’s{" "}
            <code>prompt</code>. Paste those words into the step prompt and
            re-run — the failure disappears, because now the model actually saw
            them.
          </span>
        </div>

        {error && <div className="analyzer-error mono">✕ {error}</div>}
      </div>

      {views &&
        views.map((v, i) => (
          <div key={i} className="analyzer-result">
            {views.length > 1 && (
              <div className="section-label" style={{ marginTop: 24 }}>
                {v.label} —{" "}
                {v.findingCount === 0
                  ? "clean"
                  : `${v.findingCount} finding(s)`}
              </div>
            )}
            <RunPanels run={v} />
          </div>
        ))}
    </>
  );
}
