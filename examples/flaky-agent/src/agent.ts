/**
 * A deliberately flaky agent, instrumented with the REAL published
 * `@contextcompany/custom` SDK.
 *
 * We spin up a local HTTP capture server, point the SDK's transport at it via
 * `configure({ url })`, run six scenarios, and keep exactly what the SDK put on
 * the wire — re-nested by run_id into the bundle shape Blackbox ingests. No TCC
 * account, no network beyond localhost. Every byte in traces.json is what the
 * SDK actually serialized.
 */

import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { configure, run } from "@contextcompany/custom";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../../../apps/web/app/data/traces.json");
const PORT = 4318;

// -- capture server ---------------------------------------------------------
// The transport POSTs either a bare event or a { type:"batch", items:[...] }
// envelope. We collect every flat event, then re-nest them by run_id.

interface WireEvent {
  type: string;
  run_id: string;
  [k: string]: unknown;
}

const captured: WireEvent[] = [];

function startServer(): Promise<() => Promise<void>> {
  return new Promise((resolveStart) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          const items =
            parsed?.type === "batch" && Array.isArray(parsed.items)
              ? parsed.items
              : [parsed];
          for (const item of items) captured.push(item as WireEvent);
        } catch {
          /* ignore malformed */
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });
    server.listen(PORT, "127.0.0.1", () =>
      resolveStart(() => new Promise<void>((r) => server.close(() => r())))
    );
  });
}

/** Re-nest flat events by run_id into the bundle shape Blackbox reads. */
function nest(events: WireEvent[]): unknown[] {
  const runs = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  for (const e of events) {
    if (e.type !== "run") continue;
    runs.set(e.run_id, { ...e, steps: [], toolCalls: [] });
    order.push(e.run_id);
  }
  for (const e of events) {
    const bundle = runs.get(e.run_id);
    if (!bundle) continue;
    if (e.type === "step") (bundle.steps as unknown[]).push(e);
    else if (e.type === "tool_call") (bundle.toolCalls as unknown[]).push(e);
  }
  return order.map((id) => runs.get(id)!);
}

// -- scenarios --------------------------------------------------------------
// A tiny helper to space events across real milliseconds where it matters, and
// to collide them where we specifically want to prove the detector is immune.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WEATHER_TOOLS = [{ name: "get_weather" }];

/** 1. healthy — tool result correctly spliced into the follow-up prompt. */
async function healthy() {
  const r = run({ sessionId: "demo", conversational: false });
  r.prompt("What's the weather in Oslo right now?");

  const s1 = r.step();
  s1.prompt("What's the weather in Oslo right now?")
    .response("I'll check the weather.")
    .model("gpt-4o")
    .toolDefinitions(WEATHER_TOOLS)
    .end();
  await sleep(2);

  const tc = r.toolCall("get_weather");
  tc.args({ city: "Oslo" })
    .result({ city: "Oslo", temperature: -3, condition: "snowing" })
    .end();
  await sleep(2);

  const s2 = r.step();
  s2.prompt(
    "Tool get_weather returned temperature -3 and condition snowing for Oslo. Answer the user."
  )
    .response("It's -3°C and snowing in Oslo right now.")
    .model("gpt-4o")
    .toolDefinitions(WEATHER_TOOLS)
    .finishReason("stop")
    .end();

  r.response("It's -3°C and snowing in Oslo right now.");
  await r.end();
}

/** 2. dropped_context — ★ tool succeeds, result never reaches the model. */
async function droppedContext() {
  const r = run({ sessionId: "demo" });
  r.prompt("What's the weather in Oslo right now?");

  const s1 = r.step();
  s1.prompt("What's the weather in Oslo right now?")
    .response("I'll check.")
    .model("gpt-4o")
    .toolDefinitions(WEATHER_TOOLS)
    .end();
  await sleep(2);

  const tc = r.toolCall("get_weather");
  tc.args({ city: "Oslo" })
    .result({ city: "Oslo", temperature: -3, condition: "snowing" })
    .end();
  await sleep(2);

  // The follow-up prompt does NOT include the tool result — only the question.
  const s2 = r.step();
  s2.prompt("The user asked for the weather in Oslo. Give them an answer.")
    .response("It's 15°C and sunny in Oslo right now.")
    .model("gpt-4o")
    .toolDefinitions(WEATHER_TOOLS)
    .finishReason("stop")
    .end();

  r.response("It's 15°C and sunny in Oslo right now.");
  await r.end();
}

/** 3. hallucinated_tool — model calls a tool never in tool_definitions. */
async function hallucinatedTool() {
  const r = run({ sessionId: "demo" });
  r.prompt("Book me a hotel in Tokyo for tonight.");

  const s1 = r.step();
  s1.prompt("Book me a hotel in Tokyo for tonight.")
    .response("Booking a hotel.")
    .model("gpt-4o")
    .toolDefinitions([{ name: "search_flights" }])
    .end();
  await sleep(2);

  const tc = r.toolCall("book_hotel");
  tc.args({ city: "Tokyo", nights: 1 })
    .result({ confirmation: "HT-9931" })
    .end();

  r.response("Your hotel in Tokyo is booked (HT-9931).");
  await r.end();
}

/** 4. looping — identical tool call repeated five times. */
async function looping() {
  const r = run({ sessionId: "demo" });
  r.prompt("Find me the cheapest flight to Tokyo.");

  const s1 = r.step();
  s1.prompt("Find me the cheapest flight to Tokyo.")
    .response("Searching flights.")
    .model("gpt-4o")
    .toolDefinitions([{ name: "search_flights" }])
    .end();

  for (let i = 0; i < 5; i++) {
    const tc = r.toolCall("search_flights");
    tc.args({ dest: "Tokyo", cabin: "economy" }).result({ flights: [] }).end();
    await sleep(1);
  }

  r.response("Still searching for flights to Tokyo…");
  await r.end();
}

/** 5. truncated_and_errored — tool 503s AND finish_reason length. */
async function truncatedAndErrored() {
  const r = run({ sessionId: "demo" });
  r.prompt("Summarize the quarterly report.");

  const tc = r.toolCall("fetch_report");
  tc.args({ id: "Q3" });
  // Bug #2: .error() implicitly ends the tool call. Do NOT call .end() after.
  tc.error("503 Service Unavailable");
  await sleep(2);

  const s1 = r.step();
  s1.prompt("Summarize the quarterly report using whatever data is available.")
    .response("The quarterly report shows that revenue")
    .model("gpt-4o")
    .toolDefinitions([{ name: "fetch_report" }])
    .finishReason("length")
    .end();

  r.response("The quarterly report shows that revenue");
  await r.end();
}

/** 6. confabulated — tool available, never called, model answers from memory. */
async function confabulated() {
  const r = run({ sessionId: "demo" });
  r.prompt("What's the weather in Paris right now?");

  const s1 = r.step();
  s1.prompt("What's the weather in Paris right now?")
    .response("It's currently 22°C and sunny in Paris.")
    .model("gpt-4o")
    .toolDefinitions(WEATHER_TOOLS)
    .finishReason("stop")
    .end();

  r.response("It's currently 22°C and sunny in Paris.");
  await r.end();
}

async function main() {
  const stop = await startServer();

  configure({
    apiKey: "dev_local_capture",
    url: `http://127.0.0.1:${PORT}/v1/custom`,
  });

  // Order matters: the web app defaults to trace index 1 (dropped_context) so
  // the reveal is the first thing a visitor sees. Keep healthy at index 0.
  await healthy();
  await droppedContext();
  await hallucinatedTool();
  await looping();
  await truncatedAndErrored();
  await confabulated();

  // Give the last fire-and-forget POST a beat to land, then shut down.
  await sleep(150);
  await stop();

  const bundles = nest(captured);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bundles, null, 2) + "\n");
  console.log(
    `Captured ${captured.length} events across ${bundles.length} runs -> ${OUT}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
