# Build Prompt: "Blackbox" — paste this whole thing into a fresh Claude session

---

## WHO I AM & WHAT THIS IS FOR

I'm Vaibhav Tripathi, a full-stack engineer (2 yrs: TypeScript, PostgreSQL, LLM pipelines, Next.js/SvelteKit). GitHub: `vaibhavxtripathi`. Email: `vaibhavxtripathi@gmail.com`.

I'm cold-applying to **The Context Company (YC F25)** using a playbook that already worked once: research the company deeply, build a real deployed artifact that closes a genuine gap in their product, then email the founder with a live link. (Last time this got me a CTO code review + 30-min call at a Swedish edtech startup within 17 hours of a cold email.)

**Your job: build that artifact with me, end to end, and push it to GitHub.**

Everything below is already-verified research and a spec I've iterated on. Don't re-derive it. Don't re-research the company. Build.

**Critical: every commit must be authored solely by me. Do NOT add Claude as co-author, do NOT add "Generated with Claude Code" trailers, do NOT mention AI in commit messages, README, or code comments anywhere.**

---

## THE TARGET (all verified — do not re-research)

**The Context Company** — YC Fall 2025, San Francisco, 2 people, $500K YC convertible note.

- **What they do:** observability for AI agents. They catch **"silent failures"** — bad tool calls, loops, hallucinations — the failures that return HTTP 200 and never show up in Datadog. Installable in <10 lines.
- **Site:** thecontextcompany.com · **Docs:** docs.thecontextcompany.com
- **Open source repo:** https://github.com/The-Context-Company/observatory (MIT)
- **Customers:** Mintlify, Heartbeat, Whop, Item

**Founders:**

- **Arman Kumaraswamy** — co-founder. CS+Math, Univ. of Florida. Ex-Mintlify (cut agent failure rates 82%), ex-Apten. X: `@ksw_arman`. GitHub: `armans-code`. Site: `armank.dev`. He publicly says: _"please feel free to reach out to me"_ and **"Bonus points if you email me your best personal project. I love seeing what people build when no one's asking them to."** ← this artifact IS that email.
- **Rohil Agarwal** — co-founder. EECS+Business, UC Berkeley M.E.T. Ex-Google (Gmail Intelligence, intent detection across 26B+ daily emails). X: `@rohil_ag`. **His thesis: "Context isn't just detail, it's architecture."** and on the company's origin: _"Every conversation circled back to context engineering. How agents lose track, how context rots, and how hard it is to make them reliable."_
- Best friends since 6th grade.

**They are hiring their FIRST engineer.** Arman's words: _"We care more about your slope than your y-intercept. Strong full-stack, ships fast, sharp eye for UX, and having fun building something genuinely hard."_

**Their repo README says, verbatim: "We care deeply about DX; it's our single biggest priority."** — This is the north star for the entire build.

**Their verified stack:** TypeScript (72.6% of repo), Python (17.1%). Next.js + React. OpenTelemetry core. pnpm monorepo, **Vitest**, Prettier, Changesets, MIT. Packages: `@contextcompany/{otel,widget,claude,langchain,mastra,custom,openclaw,pi,api,liftoff}`.

**Their naming theme is a space program:** `Observatory` (the OSS repo — watching) and `Liftoff` (their CLI — starting). This matters — see naming below.

---

## THE GAP WE'RE CLOSING (the strategic core — read carefully)

**The Context Company has NO eval / experiment / regression-test layer.** This is not my speculation — _their own comparison page_ (`/compare/raindrop-vs-the-context-company`) concedes it.

Their closest competitor, **Raindrop** (raindrop.ai, $15M from Lightspeed, founded by Ben Hylak ex-Apple), has:

- **Experiments** — A/B testing agent changes against live traffic
- **Workshop** — an open-source local debugger that **generates evals from real failures**

The Context Company has neither. They offer only "before/after production comparison via pattern data."

**So: Blackbox closes exactly that gap.** It reads a trace of a failed agent run and generates a runnable regression test that guarantees the failure never recurs.

### The positioning line (use this — it's the pitch)

> **Observatory watches. Liftoff starts. Blackbox is the flight recorder — it turns a crashed agent run into a regression test so it never crashes the same way twice.**

The name deliberately extends _their own_ space-program metaphor. A flight recorder is the thing you read _after_ the crash to make sure it never happens again. That's precisely the product.

### The architectural argument that makes it credible (say this in the README)

**Failure detection is pure, deterministic TypeScript. No LLM is called. Ever.**

This is a deliberate stance, not a shortcut, and it's half the pitch:

> An observability product ingests _every_ run a customer's agent makes. If classifying a trace required an LLM call, the cost of watching would scale with the cost of the thing being watched — and nobody would run it on 100% of traffic. **Detection has to be free.** The model earns its keep _after_ something is flagged — writing prose in a generated test, clustering findings across thousands of runs. Cheap deterministic filter first; expensive reasoning second, and only on the survivors.

Arman spent his time at Mintlify cutting agent failure rates. He will immediately understand why this matters and that most people building on top of LLM APIs would have naively reached for an LLM call per trace.

### The star detector: `dropped_tool_result` (this is the one that wins)

A tool call **succeeds**. The run reports `status_code: 0`. Every dashboard is green. But the tool's output was **never threaded into the next prompt** — so the model answered from memory, which is to say it made something up.

This is **literally Rohil's thesis made executable**: "how agents lose track, how context rots." Make this the hero of the demo and the README.

---

## WHAT TO BUILD

A **pnpm monorepo**, TypeScript strict, Vitest, Prettier — deliberately mirroring their own repo's toolchain.

```
blackbox/
├── package.json              # root, workspaces
├── pnpm-workspace.yaml
├── tsconfig.json             # strict + noUncheckedIndexedAccess
├── vitest.config.ts
├── .prettierrc
├── .gitignore
├── README.md                 # DX-obsessed. This is a deliverable, not an afterthought.
├── packages/core/
│   ├── package.json          # @blackbox/core; exports ".", "./replay", "./matchers"
│   ├── src/
│   │   ├── types.ts          # TCC wire format + normalized Trace + Finding + Assertion
│   │   ├── normalize.ts      # ordered timeline, tool-name resolution, declared-tool extraction
│   │   ├── detectors/
│   │   │   ├── context.ts    # ★ dropped_tool_result
│   │   │   ├── tools.ts      # hallucinated_tool, tool_loop, tool_oscillation, tool_error, silent_no_tool_use
│   │   │   ├── output.ts     # empty_response, truncated_output, step_error, run_error
│   │   │   └── index.ts      # DETECTORS registry + analyze()
│   │   ├── codegen.ts        # AnalysisResult -> runnable Vitest file
│   │   ├── replay.ts         # hermetic replay harness
│   │   ├── matchers.ts       # custom Vitest matchers
│   │   └── index.ts
│   └── test/
│       ├── fixtures.ts
│       ├── detectors.test.ts     # ~31 tests
│       └── integration.test.ts   # ~11 tests, runs against REAL SDK output
├── examples/flaky-agent/
│   └── src/agent.ts          # instrumented with the REAL @contextcompany/custom SDK
└── apps/web/                 # Next.js 15 + React 19
    ├── package.json, next.config.mjs, tsconfig.json
    ├── app/layout.tsx, app/page.tsx, app/globals.css
    ├── app/data/traces.json  # ← generated by the flaky agent, NOT hand-written
    └── components/ui.tsx
```

Target: **42+ tests passing, typecheck clean, `next build` clean.**

---

## VERIFIED SDK FACTS (I already dug these out of the real package — trust them)

Install: `npm install @contextcompany/custom` (real, published, actively maintained).

**Exports:** `Run`, `Step`, `ToolCall`, `configure`, `run`, `sendRun`, `sendStep`, `sendToolCall`, `submitFeedback`

**Builder API:**

- `run({ sessionId, conversational })` → `.prompt()`, `.step()`, `.toolCall(name)`, `.response()`, `.metadata()`, `.end()` (async)
- `step` → `.prompt()`, `.response()`, `.model()`, `.finishReason()`, `.toolDefinitions()`, `.tokens()`, `.cost()`, `.error()`, `.end()`
- `toolCall` → `.args()`, `.result()`, `.name()`, `.error()`, `.end()`

**`configure({ apiKey, url })`** — the `url` override redirects the transport. **This is the key trick:** point it at a local HTTP capture server and you get genuinely SDK-serialized traces with no TCC account.

**Wire format is snake_case** (the SDK's _input_ types are camelCase — do not confuse them):

```jsonc
// run
{ "type": "run", "run_id", "session_id", "conversational",
  "prompt": { "user_prompt", "system_prompt", "full_input" },
  "response", "full_output", "start_time", "end_time",
  "status_code", "status_message", "metadata" }

// step
{ "type": "step", "run_id", "step_id", "prompt", "response",
  "start_time", "end_time", "status_code", "status_message",
  "model": { "requested", "used" }, "finish_reason",
  "tokens": { "uncached", "cached", "completion" }, "cost",
  "tool_definitions" /* JSON string */ }

// tool_call
{ "type": "tool_call", "run_id", "tool_call_id", "tool_name",
  "start_time", "end_time", "status_code", "status_message",
  "args" /* JSON string */, "result" /* JSON string */ }
```

**`status_code`: `0` = success, `2` = error.**

---

## ⚠️ BUGS I ALREADY HIT — DO NOT REDISCOVER THESE

These cost real time. Bake the fixes in from the start.

### 1. `tool_name` (wire) vs `name` (SDK input type)

The wire payload uses `tool_name`; the SDK's `ToolCallInput` type uses `name`. **Accept both in the type, resolve once in `normalize()`** into a `ToolCall` type with a guaranteed `name`.

### 2. `.error()` implicitly ends a tool call

Calling `.end()` after `.error()` **throws**. In the flaky agent, when simulating a failed tool, call `.error(msg)` and stop — do not call `.end()`.

### 3. The SDK ships a batch envelope

The transport POSTs `{ "type": "batch", "items": [...] }`, not a bare object. Your capture server must unwrap `items`, then re-nest the flat run/step/tool_call events by `run_id` into the `RunInput` shape.

### 4. ★ `dropped_tool_result` — the ECHO false-negative

A naive implementation checks "does the tool's result string appear in a later prompt?" **This silently misses every real case**, because tools echo their own arguments back: `get_weather({city:"Oslo"}) → {city:"Oslo", temp:-3}`. "Oslo" came from the user prompt, so it always "reaches" the next prompt.

**Fix:** compute **novel** tokens only — tokens in the result that are NOT in (user prompt ∪ system prompt ∪ the tool's own args). Ask only whether the _genuinely new_ information survived. Tokenize to content words of length ≥ 4.

### 5. ★★ `dropped_tool_result` — the MILLISECOND TIMESTAMP COLLISION (worst bug)

The obvious implementation only inspects steps that start **after** the tool call ends. **On real SDK traces this catastrophically breaks:** the SDK stamps at millisecond resolution, and a fast agent emits a tool call and the following step _inside the same millisecond_. The "after" filter finds zero steps → the detector **fires on a perfectly healthy run.**

**Fix: make the detector timestamp-independent.** Ask a question ordering cannot corrupt: _does this tool's novel output appear in ANY prompt the model was ever given?_ Write an explicit regression test that collides all timestamps into a single ms and asserts the healthy run stays clean.

### 6. `.js` extension imports break the Next.js build

If `packages/core` uses `import ... from "./types.js"`, Vitest is fine but **Next's webpack fails**: `Module not found: Can't resolve './codegen.js'`. Since both Vitest and Next use bundler resolution, **use extensionless imports throughout core.**

### 7. `require("@contextcompany/custom/package.json")` throws

`ERR_PACKAGE_PATH_NOT_EXPORTED`. Don't try to read the package.json for a version check.

### 8. Brace expansion fails under `sh`

`mkdir -p packages/core/{src,test}` silently creates a literal `{packages` directory. Use explicit space-separated paths.

### 9. `tool_definitions` shape varies by provider

Handle all three: OpenAI-style `[{type:"function", function:{name}}]`, bare `[{name}]`, and record `{toolName: {...}}`. Return `[]` on malformed JSON — never throw.

---

## THE 10 DETECTORS

| Detector                | Severity | Catches                                                                                 |
| ----------------------- | -------- | --------------------------------------------------------------------------------------- |
| ★ `dropped_tool_result` | critical | Tool succeeded; its novel output never reached any prompt. **Context rot.**             |
| `hallucinated_tool`     | critical | Model called a tool absent from `tool_definitions`. (Stay silent if no tools declared.) |
| `empty_response`        | critical | `status_code: 0` + empty response body. The purest silent failure.                      |
| `run_error`             | critical | Run failed. (`silent: false` — the only loud one.)                                      |
| `tool_loop`             | high     | Same tool + identical args ≥3×. **Must be insensitive to arg key order** (sort keys).   |
| `tool_oscillation`      | high     | A→B→A→B. Distinct from a loop; a repeat-count check can't see it.                       |
| `tool_error`            | high     | Tool reported `status_code: 2`.                                                         |
| `truncated_output`      | high     | `finish_reason === "length"`. Cut off mid-fact, still looks complete.                   |
| `step_error`            | high     | An LLM step failed.                                                                     |
| `silent_no_tool_use`    | medium   | Tools available, none called, confident answer anyway. Advisory.                        |

Every finding carries a **`silent: boolean`** — true when the run reported `status_code: 0` despite the finding. **Surface this count prominently in the UI.** It is the entire thesis.

Findings carry a **declarative `Assertion`** (a tagged union, not a raw code string) so codegen owns rendering and could later target Jest or a hosted runner without touching detector code.

---

## CODEGEN + REPLAY

`generateEval(analysisResult)` emits a **self-contained, hermetic Vitest file**:

- **The fixture is inlined**, not fetched. A regression test that phones an observability API for its own input is a liability — it must still pass in CI in six months with no network and no credentials. Assert this in a test (`expect(code).not.toContain("fetch(")`).
- **Tool responses are replayed from the recording.** We're asserting on the agent's _reasoning_, so the world must be held fixed.
- **One finding → one `it()`**, with the human-readable `detail` rendered as a comment above the assertion explaining _why_.

`replay(agent, run)` is the harness: a **Proxy tool bag** serves recorded responses by tool name. A tool that failed in production fails in replay with the same message. An undeclared tool call throws loudly rather than returning `undefined`.

**Custom matchers** (`toPassToolResultToModel`, `toOnlyCallDeclaredTools`, `toHaveCalledToolAtMost`, `toHaveCalledTool`, `toHaveToolSucceeded`, `toHaveNonEmptyResponse`, `toHaveCompleteResponse`, `toHaveSucceeded`).

**The failure messages are the whole point of the matchers file.** A regression test is read exactly once — at 2am, by someone who didn't write it, when CI is red and they don't know what "oscillation" means. Each message must state what was expected, what actually happened, and enough of the trace to act on it — without making anyone open the fixture. This is the single most DX-visible file in the repo. Make it sing.

---

## THE FLAKY AGENT (this is what makes it credible)

`examples/flaky-agent/src/agent.ts` — **instrumented with the REAL published `@contextcompany/custom` SDK.**

Spin up a local HTTP capture server, `configure({ apiKey: "dev_local_capture", url: "http://127.0.0.1:4318/v1/custom" })`, run **6 scenarios**, keep exactly what the SDK put on the wire, re-nest by `run_id`, write to `apps/web/app/data/traces.json`.

The six scenarios:

1. **healthy** — tool result correctly spliced into the follow-up prompt. Must produce **zero** findings.
2. **dropped_context** — ★ tool succeeds, result never reaches the model, model confabulates ("It's 15°C and sunny" when the tool said -3°C and snowing). `status_code: 0`.
3. **hallucinated_tool** — model calls `book_hotel`, which was never in `tool_definitions`.
4. **looping** — `search_flights({dest:"Tokyo"})` called 5× identically.
5. **truncated_and_errored** — tool 503s AND `finish_reason: "length"`.
6. **confabulated** — `get_weather` available, never called, model answers from memory anyway.

**Say this in the README and the site footer:** _"These traces were not written by hand. They were produced by running a deliberately flaky agent against `@contextcompany/custom` — the real published SDK — with the transport pointed at a local capture server. Every byte is what the SDK actually serialized."_

The `integration.test.ts` suite then asserts the detectors fire correctly **on that real SDK output**, and — the money assertion — that **every broken run still reported `status_code: 0`.**

---

## THE WEB APP — UX IS SCORED HERE

Arman explicitly wants a _"sharp eye for UX."_ Their repo credits **React Scan** and the **Next.js Devtools overlay** as inspiration. Aim there.

**Aesthetic: mission control / instrument panel.** Near-black (`#07090c`), phosphor green for nominal (`#3fe08f`), amber caution, red alarm. `JetBrains Mono` for anything the machine said, `Inter` for prose. A _very_ faint scanline wash. Restrained — an instrument panel, not a toy.

Use **plain CSS with custom properties** (no Tailwind — fewer moving parts, zero build risk, and it looks better when hand-tuned).

### The core UX move — the REVEAL

This narrative sequence _is_ the product argument. Get it right:

1. **Run picker** — six chips, each with a green/red dot.
2. **VITALS panel — "what your dashboard sees."** Status: `200 OK` ✅. Latency: `900ms` ✅. Errored spans: `0` ✅. Tokens, tool calls. **Everything is green.**
3. **Then the verdict bar directly underneath, in alarm red:** _"Blackbox found 1 failure — **1 silent**, invisible to every metric above."_
4. **Findings** — severity pill, `SILENT` pill, detector name, title, and the human explanation.
5. **Timeline** — steps and tool calls **interleaved chronologically** (ordering is where failures live), flagged rows tinted red.
6. **Generated regression test** — syntax-highlighted, with a copy button.

**Default the page to trace index 1 (the context-rot run)** so the reveal is the first thing anyone sees.

That gap — between the green dashboard and the truth — is the whole reason their company exists. The UI should make a visitor _feel_ it in about four seconds.

---

## HOW TO WORK

1. Clone their repo first to ground yourself: `git clone --depth 1 https://github.com/The-Context-Company/observatory` and read `packages/ts/custom/src/types.ts` + `send.ts`. Verify my spec above against reality; if the SDK has changed since, trust the SDK and tell me.
2. Build `packages/core` and get tests green **before** touching the UI.
3. Run the flaky agent, capture real traces, get `integration.test.ts` green.
4. Build the web app. `next build` must pass.
5. Write the README last, once you know what's actually true.
6. **Push to GitHub immediately once tests are green** — don't wait until the end.

**Ask me for the GitHub token when you're ready to push** (I'll paste it then — it's a `ghp_` classic PAT with repo scope). Repo: `github.com/vaibhavxtripathi/blackbox`, public.

Git config to use:

```bash
git config user.name "Vaibhav Tripathi"
git config user.email "vaibhavxtripathi@gmail.com"
```

**Commits must be in my name only. No Claude co-author trailer, no "Generated with" footer, no AI mention anywhere in the repo.** Write commit messages the way a careful engineer would: imperative mood, explaining _why_ where it isn't obvious.

Then: deploy `apps/web` to Vercel and give me the live URL.

---

## README REQUIREMENTS

It's a hiring artifact aimed at a team whose stated #1 priority is DX. It must contain:

- The positioning line (Observatory watches / Liftoff starts / Blackbox is the flight recorder).
- The **"detection is free"** architectural argument, stated as a deliberate design decision.
- A worked example of the `dropped_tool_result` failure with the actual before/after (`-3°C and snowing` vs. the confabulated `15°C and sunny`).
- The generated test, shown inline.
- **Tradeoffs and limitations, honestly stated.** What Blackbox does _not_ do. Where the heuristics could false-positive. This section earns more credibility than any feature list.
- The bugs above, written up as "problems hit" — especially the millisecond-collision one. Engineers respect a war story with a root cause.
- Credit React Scan / Next.js Devtools for the aesthetic, the way their own repo does.

Keep it tight. No filler. No emoji.

---

## SUCCESS CRITERIA

- [ ] `npx vitest run` → 42+ passing, including integration tests against real SDK output
- [ ] `npx tsc --noEmit` → clean
- [ ] `next build` → clean
- [ ] The healthy run produces **zero** findings (no false positives — this is the hard part)
- [ ] The context-rot run is caught **despite `status_code: 0`**
- [ ] Deployed to Vercel, live URL
- [ ] Pushed to GitHub, all commits authored by me alone
- [ ] The reveal lands in under four seconds for someone who's never seen it

Build it. Ask me anything you need.
