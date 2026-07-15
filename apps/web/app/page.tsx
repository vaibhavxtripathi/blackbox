import type { WireRunBundle } from "@blackbox/core";
import rawTraces from "./data/traces.json";
import { Dashboard } from "../components/ui";
import { Analyzer } from "../components/analyzer";
import { toView } from "../lib/toView";

const bundles = rawTraces as unknown as WireRunBundle[];

export default function Page() {
  const runs = bundles.map((b, i) => toView(b, i));

  return (
    <main className="wrap">
      <header className="masthead">
        <div className="logo">
          BLACKBOX<span className="dot">.</span>
        </div>
        <h1 className="lede">
          The run was <span className="em">green</span>. The answer was wrong.
        </h1>
        <p className="sub">
          Agents fail silently — status 200, dashboards clean, answer
          fabricated. Blackbox reads a run, catches the failure with
          deterministic checks, and writes a test so it can’t come back.
        </p>
      </header>

      <Dashboard runs={runs} />

      <Analyzer />

      <footer className="foot">
        Traces are real: captured from{" "}
        <a href="https://www.npmjs.com/package/@contextcompany/custom">
          @contextcompany/custom
        </a>
        , the published SDK, through a local transport. Detection is pure
        TypeScript — no model calls.
      </footer>
    </main>
  );
}
