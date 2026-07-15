"use client";

import { useState } from "react";

export interface VitalsView {
  statusCode: number;
  statusLabel: string;
  latencyMs: number;
  erroredSpans: number;
  tokens: number;
  toolCalls: number;
}

export interface TimelineRow {
  kind: "step" | "tool_call";
  name: string;
  meta: string;
  statusCode: number;
  flagged: boolean;
  flagReason?: string;
}

export interface FindingView {
  detector: string;
  severity: "critical" | "high" | "medium";
  silent: boolean;
  title: string;
  detail: string;
}

export interface RunView {
  id: string;
  label: string;
  ok: boolean;
  vitals: VitalsView;
  findingCount: number;
  silentCount: number;
  findings: FindingView[];
  timeline: TimelineRow[];
  code: string;
}

function Vitals({ v }: { v: VitalsView }) {
  const ok = (n: number) => n === 0;
  return (
    <div className="vitals">
      <div className="vital">
        <div className="k">Status</div>
        <div className="v ok">
          {v.statusCode === 0 ? "200 OK" : `ERR ${v.statusCode}`}{" "}
          <span className="tick">✓</span>
        </div>
      </div>
      <div className="vital">
        <div className="k">Latency</div>
        <div className="v ok">
          {v.latencyMs}ms <span className="tick">✓</span>
        </div>
      </div>
      <div className="vital">
        <div className="k">Errored spans</div>
        <div className={"v" + (ok(v.erroredSpans) ? " ok" : "")}>
          {v.erroredSpans}{" "}
          {ok(v.erroredSpans) && <span className="tick">✓</span>}
        </div>
      </div>
      <div className="vital">
        <div className="k">Tokens</div>
        <div className="v">{v.tokens}</div>
      </div>
      <div className="vital">
        <div className="k">Tool calls</div>
        <div className="v">{v.toolCalls}</div>
      </div>
    </div>
  );
}

function Verdict({ run }: { run: RunView }) {
  if (run.findingCount === 0) {
    return (
      <div className="verdict good">
        <span className="mark">✓</span>
        <span>
          Clean run — nothing hidden. The dashboard is telling the truth.
        </span>
      </div>
    );
  }
  return (
    <div className="verdict bad">
      <span className="mark">✕</span>
      <span>
        <b>
          {run.findingCount} failure{run.findingCount > 1 ? "s" : ""} —{" "}
          {run.silentCount} silent
        </b>
        , invisible to every metric above.
      </span>
    </div>
  );
}

function Findings({ findings }: { findings: FindingView[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="panel">
      <div className="panel-head">Findings</div>
      {findings.map((f, i) => (
        <div className="finding" key={i}>
          <div className="finding-head">
            <span className={"pill " + f.severity}>{f.severity}</span>
            {f.silent && <span className="pill silent">silent</span>}
            <span className="detector-name">{f.detector}</span>
          </div>
          <div className="finding-title">{f.title}</div>
          <div className="finding-detail">{f.detail}</div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <div className="panel">
      <div className="panel-head">Timeline</div>
      {rows.map((r, i) => (
        <div className={"tl-row" + (r.flagged ? " flagged" : "")} key={i}>
          <div className={"tl-kind" + (r.kind === "tool_call" ? " tool" : "")}>
            {r.kind === "tool_call" ? "tool" : "step"}
          </div>
          <div className="tl-body">
            <div>
              <span className="name">{r.name}</span>
              <span
                className={"tl-badge " + (r.statusCode === 2 ? "err" : "ok")}
              >
                {r.statusCode === 2 ? "error" : "ok"}
              </span>
            </div>
            <div className="meta">{r.meta}</div>
            {r.flagged && r.flagReason && (
              <div className="flag">↳ {r.flagReason}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lightweight token highlighter — no external syntax lib, zero build risk. */
function highlight(code: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(code)
    .replace(/(\/\/[^\n]*)/g, '<span class="c">$1</span>')
    .replace(
      /\b(import|from|const|describe|it|expect|as|any)\b/g,
      '<span class="k">$1</span>'
    )
    .replace(
      /(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
      '<span class="s">$1</span>'
    )
    .replace(
      /\b(replay|generateEval|toPassToolResultToModel|toOnlyCallDeclaredTools|toHaveCalledToolAtMost|toHaveToolSucceeded|toHaveNonEmptyResponse|toHaveCompleteResponse|toHaveCalledTool|toHaveSucceeded)\b/g,
      '<span class="f">$1</span>'
    );
}

function GeneratedTest({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="panel">
      <div className="panel-head">
        Generated test · hermetic, runs in CI forever
      </div>
      <div className="codewrap">
        <button
          className="copy-btn"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
        >
          {copied ? "copied ✓" : "copy"}
        </button>
        <pre
          className="code"
          dangerouslySetInnerHTML={{ __html: highlight(code) }}
        />
      </div>
    </div>
  );
}

export function Dashboard({ runs }: { runs: RunView[] }) {
  // Default to the context-rot run (index 1) so the reveal is the first thing seen.
  const [active, setActive] = useState(Math.min(1, runs.length - 1));
  const run = runs[active]!;

  return (
    <>
      <div className="eyebrow">Recorded runs</div>
      <div className="chips">
        {runs.map((r, i) => (
          <button
            key={r.id}
            className={"chip" + (i === active ? " active" : "")}
            onClick={() => setActive(i)}
          >
            <span className={"dot " + (r.ok ? "dot-green" : "dot-red")} />
            {r.label}
          </button>
        ))}
      </div>

      <RunPanels run={run} />
    </>
  );
}

/** The vitals → verdict → findings → timeline → test stack for a single run.
 *  Shared by the demo dashboard and the "analyze your own trace" box. */
export function RunPanels({ run }: { run: RunView }) {
  return (
    <>
      <div className="cluster">
        <Vitals v={run.vitals} />
        <Verdict run={run} />
      </div>
      <Findings findings={run.findings} />
      <Timeline rows={run.timeline} />
      {run.findingCount > 0 && <GeneratedTest code={run.code} />}
    </>
  );
}
