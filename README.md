# Blackbox

**Observatory watches. Liftoff starts. Blackbox is the flight recorder** — it
turns a crashed agent run into a regression test so it never crashes the same
way twice.

Blackbox reads a trace of an agent run and generates a runnable regression test
that guarantees the failure never recurs. It specializes in **silent failures**:
the ones that return `status_code: 0`, stay green on every dashboard, and are
therefore the ones nobody writes a test for.

The name extends the space-program metaphor deliberately. A flight recorder is
the thing you read _after_ a crash to make sure it never happens again. That is
precisely the product.

---

## The gap this closes

The Context Company's own comparison page concedes it has no eval / experiment /
regression-test layer. Raindrop has "Experiments" and a "Workshop" that
generates evals from failures; The Context Company offers only before/after
production comparison. Blackbox is exactly that missing layer, built to sit on
top of the trace format their SDK already emits.

## Detection is free — a design decision, not a shortcut

**Failure detection is pure, deterministic TypeScript. No LLM is called. Ever.**

An observability product ingests _every_ run a customer's agent makes. If
classifying a trace required an LLM call, the cost of watching would scale with
the cost of the thing being watched — and nobody would run it on 100% of
traffic. **Detection has to be free.** The model earns its keep _after_ a flag
is raised: writing prose in a generated test, clustering findings across
thousands of runs. Cheap deterministic filter first; expensive reasoning
second, and only on the survivors.

## The hero detector: `dropped_tool_result`

A tool call **succeeds**. The run reports `status_code: 0`. Every dashboard is
green. But the tool's output was **never threaded into the next prompt** — so
the model answered from memory, which is to say it made something up. This is
context rot made executable.

The worked example, straight from the captured traces:

```
user asks   : "What's the weather in Oslo right now?"
get_weather : { "city": "Oslo", "temperature": -3, "condition": "snowing" }   ✓ status 0
next prompt : "The user asked for the weather in Oslo. Give them an answer."   ← result absent
model says  : "It's 15°C and sunny in Oslo right now."
```

The tool said **-3°C and snowing**. The agent said **15°C and sunny**. The run
is green. Nothing caught it — except Blackbox.

### Why the naive version is silently wrong

Two bugs make a first attempt fail without telling you:

1. **The echo false-negative.** Tools echo their own arguments back:
   `get_weather({city:"Oslo"}) → {city:"Oslo", temp:-3}`. A substring check for
   the result in a later prompt always "finds" `Oslo`, because `Oslo` came from
   the user. Fix: consider only **novel** tokens — those in the result but not
   in the user prompt, system prompt, or the tool's own args. Ask whether the
   genuinely new information survived, nothing else.

2. **The millisecond-collision false-positive.** The obvious implementation
   only inspects steps that start _after_ the tool call ends. On real SDK
   traces this catastrophically breaks: the SDK stamps at millisecond
   resolution, and a fast agent emits a tool call and the following step inside
   the same millisecond. The "after" filter finds zero later steps and the
   detector **fires on a perfectly healthy run.** Fix: the detector is
   **timestamp-independent** — it asks whether the novel output appears in ANY
   prompt the model was ever given, a question ordering cannot corrupt. There is
   a regression test (`droppedContextSameMs`) that collides every timestamp into
   a single millisecond and asserts the healthy path stays clean.

## The generated test

One finding becomes one hermetic `it()`. The failure explanation is rendered as
a comment above the assertion:

```ts
import { describe, it, expect } from "vitest";
import { replay } from "@blackbox/core/replay";
import "@blackbox/core/matchers";

const recording = {/* the full trace, inlined verbatim */} as const;

describe("regression: run 146fd19f…", () => {
  it('[dropped_tool_result] Tool "get_weather" succeeded but its result never reached the model', () => {
    const result = replay(recording as any);
    // The tool call "get_weather" returned successfully, yet none of the new
    // information it produced (e.g. temperature, condition, snowing) appears in
    // any prompt the model was subsequently given. This is context rot: the run
    // is green, but the answer is built on nothing.
    expect(result).toPassToolResultToModel("get_weather");
  });
});
```

Two properties are enforced by tests, not convention:

- **The fixture is inlined, never fetched.** A regression test that phones an
  observability API for its own input is a liability — it must still pass in CI
  in six months with no network and no credentials. `generateEval` output is
  asserted to never contain `fetch(`.
- **Tool responses replay from the recording.** We assert on the agent's
  _reasoning_, so the world is held fixed. A tool that failed in production
  fails in replay with the same message; an undeclared tool call throws loudly
  rather than returning `undefined`.

## The ten detectors

| Detector              | Severity | Catches                                                                 |
| --------------------- | -------- | ----------------------------------------------------------------------- |
| `dropped_tool_result` | critical | Tool succeeded; its novel output never reached any prompt. Context rot. |
| `hallucinated_tool`   | critical | Model called a tool absent from `tool_definitions`.                     |
| `empty_response`      | critical | `status_code: 0` with an empty body. The purest silent failure.         |
| `run_error`           | critical | Run failed. The only _loud_ detector — `silent: false`.                 |
| `tool_loop`           | high     | Same tool + identical args ≥3×. Insensitive to arg key order.           |
| `tool_oscillation`    | high     | A→B→A→B. A repeat-count check can't see it.                             |
| `tool_error`          | high     | Tool reported `status_code: 2`.                                         |
| `truncated_output`    | high     | `finish_reason === "length"` — cut off mid-fact, still looks complete.  |
| `step_error`          | high     | An LLM step failed.                                                     |
| `silent_no_tool_use`  | medium   | Tools available, none called, confident answer anyway. Advisory.        |

Every finding carries `silent: boolean` — `true` when the run reported
`status_code: 0` despite the defect. That count is surfaced first in the UI,
because it is the entire thesis.

## The traces are real

The traces in [`apps/web/app/data/traces.json`](apps/web/app/data/traces.json)
were **not written by hand.** They were produced by running a deliberately flaky
agent ([`examples/flaky-agent`](examples/flaky-agent/src/agent.ts)) against
[`@contextcompany/custom`](https://www.npmjs.com/package/@contextcompany/custom)
— the real published SDK — with the transport pointed at a local capture server
via `configure({ url })`. Every byte is what the SDK actually serialized.

The integration suite then asserts the detectors fire correctly on that real
output, and — the money assertion — that **every broken run still reported
`status_code: 0`.**

## Layout

```
packages/core/      the analysis engine — detectors, codegen, replay, matchers
examples/flaky-agent/  6 scenarios instrumented with the real SDK + capture server
apps/web/           Next.js dashboard — the reveal
```

## Run it

```bash
pnpm install
pnpm test          # 62 tests, incl. integration against real SDK output
pnpm typecheck
pnpm capture       # re-run the flaky agent, regenerate traces.json
pnpm --filter @blackbox/web dev
```

## Problems hit along the way

Worth writing down, because a war story with a root cause is more honest than a
feature list:

- **`tool_name` vs `name`.** The wire payload uses `tool_name`; the SDK's input
  type uses `name`. Resolved once in `normalize()` so nothing downstream has to
  know both spellings exist.
- **The flat step wire format.** The docs suggest a nested
  `model: { requested, used }` / `tokens: {…}` shape. The SDK actually
  serializes flat: `model_used`, `prompt_uncached_tokens`, `real_total_cost`.
  Reading the SDK source beat trusting the docs.
- **`.error()` implicitly ends a tool call.** Calling `.end()` after `.error()`
  throws. In the flaky agent's errored-tool scenario, we call `.error(msg)` and
  stop.
- **The batch envelope.** The transport POSTs `{ type: "batch", items: [...] }`,
  not a bare object. The capture server unwraps `items` and re-nests flat events
  by `run_id`.
- **The millisecond collision** (above) — the worst one, because it makes the
  detector fire on healthy runs.
- **`.js` extension imports break the Next build.** Vitest tolerates them;
  Next's webpack does not. Core uses extensionless imports throughout.
- **`tool_definitions` shape varies by provider.** Handled for OpenAI-style
  `[{type:"function", function:{name}}]`, bare `[{name}]`, and record
  `{toolName:{…}}`. Malformed JSON yields `[]`, never a throw.

## Limitations, honestly stated

Blackbox is a set of heuristics over a trace. It is not, and does not claim to
be, a semantic judge.

- **`dropped_tool_result` is lexical, not semantic.** It checks whether the
  tool's novel _tokens_ reached a prompt, not whether the model _used_ them
  correctly. An agent that receives the result and then still ignores it will
  pass this check. It also can't see information the tool passed through a
  channel other than the recorded prompt text.
- **`silent_no_tool_use` is advisory and will false-positive.** Plenty of
  questions genuinely don't need a tool. It flags for a human to glance at, not
  to fail a build. It is medium severity for that reason.
- **The novel-token heuristic can miss short or numeric-only results.** Tokens
  shorter than four characters are dropped to suppress noise; a tool whose only
  new information is a two-digit number can slip through.
- **Oscillation detection only sees the A→B→A→B pattern.** Longer cycles
  (A→B→C→A→B→C) are not yet caught.
- **Everything here operates post-hoc on a completed trace.** Blackbox tells you
  a run already failed silently and pins it; it does not intervene mid-run.

## Credits

The instrument-panel aesthetic owes a debt to
[React Scan](https://github.com/aidenybai/react-scan) and the Next.js Devtools
overlay — the same inspirations The Context Company's own repo credits.

MIT.
