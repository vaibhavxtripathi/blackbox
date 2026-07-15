import { analyze, normalize, generateEval } from "@blackbox/core";
import type { WireRunBundle, Trace, Finding } from "@blackbox/core";
import rawTraces from "./data/traces.json";
import { Dashboard, type RunView } from "../components/ui";

const bundles = rawTraces as unknown as WireRunBundle[];

// The flaky agent emits scenarios in this fixed order (see examples/flaky-agent).
const LABELS = [
  "healthy",
  "dropped-context",
  "hallucinated-tool",
  "looping",
  "truncated+errored",
  "confabulated",
];

function labelFor(trace: Trace, i: number): string {
  return LABELS[i] ?? trace.userPrompt.slice(0, 24) ?? `run ${i}`;
}

/** Which timeline nodes a finding implicates, for red-tinting the rows. */
function flagReasonFor(
  node: { kind: string; id: string; name?: string; statusCode: number },
  findings: Finding[]
): string | undefined {
  for (const f of findings) {
    const a = f.assertion;
    if (node.kind === "tool_call") {
      if (a.kind === "passesToolResultToModel" && a.toolCallId === node.id)
        return f.title;
      if (a.kind === "toolSucceeds" && a.toolCallId === node.id) return f.title;
      if (
        a.kind === "onlyCallsDeclaredTools" &&
        node.name &&
        !a.declared.includes(node.name)
      )
        return f.title;
      if (a.kind === "callsToolAtMost" && a.toolName === node.name)
        return f.title;
      if (node.statusCode === 2) return f.title;
    }
    if (node.kind === "step") {
      if (a.kind === "completeResponse" && a.stepId === node.id) return f.title;
      if (a.kind === "stepSucceeds" && a.stepId === node.id) return f.title;
      if (node.statusCode === 2) return f.title;
    }
  }
  return undefined;
}

function toView(bundle: WireRunBundle, i: number): RunView {
  const trace = normalize(bundle);
  const analysis = analyze(trace);
  const erroredSpans =
    trace.steps.filter((s) => s.statusCode === 2).length +
    trace.toolCalls.filter((t) => t.statusCode === 2).length;

  const timeline = trace.timeline.map((n) => {
    const reason = flagReasonFor(n, analysis.findings);
    if (n.kind === "tool_call") {
      const args = n.argsRaw ? ` ${n.argsRaw}` : "";
      const res = n.resultRaw ? ` → ${n.resultRaw}` : "";
      return {
        kind: "tool_call" as const,
        name: n.name + "()",
        meta: (args + res).trim() || "(no args)",
        statusCode: n.statusCode,
        flagged: reason !== undefined,
        ...(reason ? { flagReason: reason } : {}),
      };
    }
    return {
      kind: "step" as const,
      name: n.modelUsed ? `LLM step · ${n.modelUsed}` : "LLM step",
      meta:
        `prompt: ${n.prompt.slice(0, 110)}` +
        (n.finishReason ? `  ·  finish: ${n.finishReason}` : ""),
      statusCode: n.statusCode,
      flagged: reason !== undefined,
      ...(reason ? { flagReason: reason } : {}),
    };
  });

  return {
    id: trace.runId,
    label: labelFor(trace, i),
    ok: analysis.findings.length === 0,
    vitals: {
      statusCode: trace.statusCode,
      statusLabel: trace.statusCode === 0 ? "200 OK" : "error",
      latencyMs: Math.max(1, trace.endTime - trace.startTime),
      erroredSpans,
      tokens: trace.steps.length * 150,
      toolCalls: trace.toolCalls.length,
    },
    findingCount: analysis.findings.length,
    silentCount: analysis.silentCount,
    findings: analysis.findings.map((f) => ({
      detector: f.detector,
      severity: f.severity,
      silent: f.silent,
      title: f.title,
      detail: f.detail,
    })),
    timeline,
    code: analysis.findings.length ? generateEval(analysis) : "",
  };
}

export default function Page() {
  const runs = bundles.map(toView);

  return (
    <main className="wrap">
      <header className="masthead">
        <div className="logo">
          BLACKBOX<span className="dot">.</span>
        </div>
        <div className="tagline">
          Observatory watches. Liftoff starts.{" "}
          <b>Blackbox is the flight recorder</b> — it turns a crashed agent run
          into a regression test so it never crashes the same way twice.
        </div>
      </header>

      <Dashboard runs={runs} />

      <footer className="foot">
        These traces were not written by hand. They were produced by running a
        deliberately flaky agent against{" "}
        <a href="https://www.npmjs.com/package/@contextcompany/custom">
          @contextcompany/custom
        </a>{" "}
        — the real published SDK — with the transport pointed at a local capture
        server. Every byte is what the SDK actually serialized.
        <br />
        Detection is pure deterministic TypeScript; no LLM is called. Aesthetic
        owes a debt to React Scan and the Next.js Devtools overlay.
      </footer>
    </main>
  );
}
