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
        <div className="tagline">
          Observatory watches. Liftoff starts.{" "}
          <b>Blackbox is the flight recorder</b> — it turns a crashed agent run
          into a regression test so it never crashes the same way twice.
        </div>
      </header>

      <section className="intro">
        <p>
          AI agents fail <b>silently</b>: the run returns{" "}
          <span className="mono ok">200 OK</span>, every dashboard stays green —
          and the answer is still wrong. Blackbox reads a run and catches those
          failures with pure, deterministic checks (no LLM), then writes a test
          so the same bug can’t come back.
        </p>
        <p className="intro-cta">
          Below are six real runs. Click a <span className="red-dot">red</span>{" "}
          one to see a caught failure — or scroll down and{" "}
          <b>paste your own trace</b> to run the detectors yourself.
        </p>
      </section>

      <Dashboard runs={runs} />

      <div className="divider" />

      <Analyzer />

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
