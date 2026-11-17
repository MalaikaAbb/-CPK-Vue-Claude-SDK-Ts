# CopilotKit Vue + Claude Agent SDK (TypeScript) Test Suite

A navigable, working test harness for CopilotKit's **Vue** frontend against a **Claude Agent SDK (TypeScript)** agent. Each Vue doc page is a route that runs that page's own code.

| | |
|---|---|
| **Doc sync date** | Machine-maintained: `doc-snapshot/manifest.json` → `syncedAt` (baseline taken 2026-11-13, 22 pages; the nine Generative UI › Components pages added 2026-11-17, 31 in all). |
| **CopilotKit packages** | `@copilotkit/vue` 1.87.0 · `@copilotkit/core` 1.87.0 · `@copilotkit/runtime` 1.87.0 · `@ag-ui/client` 1.0.2 (`HttpAgent`, the same copy the runtime uses) |
| **Claude** | `@anthropic-ai/claude-agent-sdk` **0.3.306** (harness-pinned, §9.2; bundles the Claude Code CLI it drives) · `@ag-ui/claude-agent-sdk` 0.0.9 · `@ag-ui/core` / `@ag-ui/encoder` / `@ag-ui/client` 1.0.4 · `@anthropic-ai/sdk` 1.8.0 · `express` 5.3.0 · `dotenv` 18.0.10 · `zod` 4.6.7 · `tsx` 4.23.15 · TypeScript 7.0 |
| **Frontend** | Vite 8.3 · Vue 3.5 · vue-router 5.5 · TypeScript 6.0 · Tailwind 4.3 (harness chrome only) · zod 3.25.76 · chart.js 4.6.1 · maplibre-gl 5.24.1 (Components pages) |
| **Build status** | No CI. `vite build` ✅. `vue-tsc` reports 9 errors, all in published doc code (§9.10). All 86 URLs (every route and every demo sample, Components pages included) mounted in headless Chrome with **zero console or page errors** (2026-11-17; the Quickstart and Components overview demos call `:8200` directly, so they need a runtime there). The chain (runtime → `HttpAgent` → Claude agent → model call) was driven with the agent's `ANTHROPIC_BASE_URL` pointed at a local capture server, so nothing left the machine: the captured request carried the run's frontend tool (`mcp__ag_ui__show_x`), the generic `ag_ui_update_state` tool, and the context in the system prompt. See §9.13 on authentication. **No route has been driven against a live model yet.** Tool Rendering was driven end to end in the browser against a local stand-in Anthropic API (2026-11-17): all three renderers drew the page's `get_weather` call (§9.3). |

---

## 2. Overview

The Claude Agent SDK runs Claude as an agent (it drives the Claude Code CLI as a subprocess); this repo uses its TypeScript edition. CopilotKit reaches it over AG-UI: the `@ag-ui/claude-agent-sdk` adapter (`ClaudeAgentAdapter`) turns AG-UI run input into SDK calls and its events are streamed back from an Express endpoint, the Copilot Runtime registers an AG-UI `HttpAgent` pointed at it, and `@copilotkit/vue` renders the conversation, tools and state.

This repo turns the Quickstart and the Basics, Generative UI, Interactivity and Agent capabilities sections of the Vue Claude Agent SDK (TypeScript) sidebar (22 pages) into one navigable Vite app. It adds the nine **Generative UI › Components** pages, which aren't under `/vue` and print each sample for React, Angular, React Native and Vue; only their Vue tab is used. Every route mounts the page's code verbatim, bugs included, and shows the exact files that run. Anything the harness added is marked **[harness]** in the file, in a pink **Harness** callout on the notes page, and, for stand-in components, with a **HARNESS STAND-IN** badge on screen.

Tracks: **<https://docs.copilotkit.ai/vue/claude-sdk-typescript>** and **<https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components>**

---

## 3. Architecture

```
Browser — Vite dev server · localhost:5173
  │  @copilotkit/vue/v2; each /<route>/demo-chat mounts that page's own App.vue
  │  runtime-url="/api/copilotkit…" ──► Vite proxy /api → :8200
  ▼
Node · backend/server.ts · localhost:8200
  │  Vue Quickstart's host: createServer + createCopilotNodeListener({ cors: true })
  │  Claude landing page's runtime: my_agent = new HttpAgent({ url: AGENT_URL })
  │  /api/copilotkit           every doc agent id → my_agent
  │  /api/copilotkit-threads   Intelligence quickstart's runtime (if key set)  [harness: own path]
  │  /api/copilotkit-mcp-apps  MCP Apps' runtime (mcpApps.servers)            [harness: own path]
  │  /api/copilotkit-tool-rendering  default → AGENT_URL + "tool-rendering"   [harness: own path]
  ▼  AGENT_URL (AG-UI over HTTP)
Node · agent/src/harness-server.ts · localhost:8000   (npx tsx)   [harness entry]
  │  loads agent/src/agent-server.ts unchanged — Claude Agent SDK Quickstart:
  │    ClaudeAgentAdapter({ model: CLAUDE_MODEL, tools: [], permissionMode: "dontAsk" }) → Express POST "/"
  │  + POST /tool-rendering on the same app: Tool Rendering's published get_weather (§9.3)
  ▼
Anthropic                                 MCP Apps example server on :3101 (MCP Apps route only)
```

**Three processes.** The agent and the Copilot Runtime are **TypeScript on Node** (`tsx`). The frontend is Vite.

**Where each piece comes from.**
- **The Vue Claude Agent SDK Quickstart redirects to a landing page.** Its `.md` is the Vue (built-in agent) Quickstart, which says to keep its Vue frontend steps and take "the runtime wiring" from your framework's quickstart. So `App.vue`, `main.ts` and the Node host come from the Vue Quickstart.
- **The landing page's only code block is the runtime**, published as a Next.js route: `agents: { my_agent: new HttpAgent({ url: process.env.AGENT_URL! }) }`. It's used verbatim, hosted in the Vue Quickstart's Node listener.
- **The agent** is the Claude Agent SDK Quickstart's (`/claude-sdk-typescript/quickstart`, linked as the landing page's guide): "Use an existing agent". That's `agent/src/agent-server.ts` verbatim, in a project created by the Quickstart's two `npm install` lines, with one flagged version change (§9.2).

### Agent ids

The landing page registers only `my_agent`. The Vue samples use `default` (no agent-id), `my-agent`, `sales`, `support`, `researcher`, `workspace` and `writer`. Every id is `my_agent` (`backend/agents.ts`): no page publishes a complete Claude agent of its own (§9.2, §9.3). The one exception is Tool Rendering, whose `default` is the Quickstart agent plus the page's published `get_weather`, on its own runtime path (§9.3). The Components samples keep `runtime-url="/api/copilotkit"` as published, so they run on `default` too (the ms-agent-py choice; §9.15).

### What the adapter does for you (verified by capturing the model request)

- **Frontend tools:** `@ag-ui/claude-agent-sdk` builds an in-process MCP server from the run's `tools` and grants them (`mcp__ag_ui__<name>`), so `useFrontendTool`, `useComponent` and `useHumanInTheLoop` tools reach the Quickstart agent with no change to `agent-server.ts`.
- **Context and state:** it appends the run's `context` and current `state` to the system prompt.
- **State writes:** whenever a run carries state, it adds a generic `ag_ui_update_state` tool. The agent *can* write shared state through it if the model chooses to, as one snapshot when the call completes (not streamed). No page's code asks it to (§9.4).
- **Generative UI › Components:** the runtime adds `render_ui` to the run's tools and its guide to the run's context. The model sees the tool as `mcp__ag_ui__render_ui`, and the adapter reports the call back as `render_ui`. The guide lands in the system prompt (captured, §9.15).
- **Not provided:** backend tools and interrupts. The Quickstart agent has none, and no page publishes a usable one.

---

## 4. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **24.12+** (or 22.18+) | `create-vue`'s scaffold requires it. Developed on 24.16. |
| npm | 10+ | Developed on npm 12. |
| Anthropic API key | — | Required, in `agent/.env`. The agent uses `claude-opus-4-8` as published (`CLAUDE_MODEL`). See §9.13 on how the CLI authenticates. |
| CopilotKit Intelligence key | — | Optional, only for the two Threads routes. |

---

## 5. Setup

```bash
git clone <this-repo> claude-sdk-ts && cd claude-sdk-ts
cd agent && npm install && cd ..
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cp .env.example agent/.env              # set ANTHROPIC_API_KEY
cp .env.example backend/.env            # AGENT_URL is pre-filled
```

| File | Variable | What it does |
|---|---|---|
| `agent/.env` | `ANTHROPIC_API_KEY` | **Required.** Loaded by `agent-server.ts` (`dotenv.config()`) for the Claude Agent SDK. |
| `agent/.env` | `CLAUDE_MODEL` · `AGENT_PORT` | The Quickstart's model (`claude-opus-4-8`) and port (8000); both are also the code's fallbacks. |
| `backend/.env` | `AGENT_URL` | **Required.** The landing page's `HttpAgent` URL: `http://localhost:8000/`. |
| `backend/.env` | `CPK_INTELLIGENCE_API_KEY` | Optional. Intelligence for the Threads runtime: `cd backend && npx copilotkit@latest login && npx copilotkit@latest project select`. |
| `backend/.env` | `APP_USER_ID` · `MCP_APPS_URL` · `PORT` · `COPILOTKIT_TELEMETRY_DISABLED` | Optional: fixed local Threads identity (default `local-user`), MCP server URL (default `http://localhost:3101/mcp`), runtime port (default 8200), telemetry opt-out. |

**Ports:** agent **8000** (`AGENT_PORT`), runtime **8200**, frontend **5173** (`strictPort`), MCP Apps example **3101**.

---

## 6. Running the project

```bash
# 1 — Claude agent (agent-server.ts loads agent/.env itself)
cd agent && npx tsx src/harness-server.ts
```
`harness-server.ts` runs the Quickstart's `agent-server.ts` unchanged and adds Tool Rendering's `POST /tool-rendering` to its app (§9.3). The Quickstart's own command, `npx tsx src/agent-server.ts`, still works for every route except Tool Rendering.

Success: `Claude Agent SDK listening on http://localhost:8000`, and `curl http://localhost:8000/health` returns `{"status":"ok"}`. **If port 8000 is taken:** set `AGENT_PORT` in `agent/.env` and `AGENT_URL` in `backend/.env` to match.

```bash
# 2 — Copilot Runtime
cd backend && npm run dev
```
Success:
```
Copilot Runtime listening at http://localhost:8200/api/copilotkit
  Agent: http://localhost:8000/
  + /api/copilotkit-threads  (sse)
  + /api/copilotkit-mcp-apps
  + /api/copilotkit-tool-rendering
```

```bash
# 3 — Vue app
cd frontend && npm run dev               # → http://localhost:5173/
```

Open **<http://localhost:5173>**. The landing page's **Connection** panel probes the runtime paths. **MCP Apps route only:** `cd backend && npm run mcp:apps`.

---

## 7. What to expect: walkthrough per section

Each route has a notes page (`/<route>`: notes, Try-it prompts with pass/fail, the exact source, unmounted samples as published, Harness and gap callouts) and a demo (`/<route>/demo-chat`; a **Sample** picker where a page has several samples).

### Getting Started
**`/quickstart`**: **Try:** `Hello! What can you do?` **Pass:** a streamed reply. **Fail:** connection refused or `RUN_ERROR` means the agent isn't running or `AGENT_URL` is wrong. `Invalid API key` means `ANTHROPIC_API_KEY` is missing or wrong in `agent/.env`.

### Basics
**`/prebuilt-components`**, **`/custom-look-and-feel/headless-ui`**, **`/programmatic-control`**: chat against `my_agent`: a streamed reply. Headless UI streams into bare rows. Programmatic Control's default sample adds a chat (harness, on request). **`/custom-look-and-feel/slots`**: nine samples; the **Disclaimer** sample shows no disclaimer (doc bug, §9.11).
**`/prebuilt-components/copilot-threads-drawer`**, **`/headless-threads`**: need `CPK_INTELLIGENCE_API_KEY`. `/api/copilotkit-threads/info` should report `mode: "intelligence"`.
**`/frontend-tools`**: **Try:** `Only show sev1 incidents`. **Pass:** "Current filter" changes to `sev1` and the agent confirms.

### Generative UI
**`/generative-ui/tool-based`**: **Try:** `Show me the weather in Paris`. **Pass:** an inline WeatherCard.
**`/generative-ui/tool-rendering`**: Ask "What is the weather in Tokyo?" in each variant. **Expected:** zero-config shows a `get_weather` card ending "Done"; catch-all shows the BrandedToolCard stand-in with the handler's JSON (`68`, `Sunny`); per-tool shows `WeatherToolCard` with that JSON, but its heading is empty (doc bug: it reads `parameters.city`, while the tool takes `location`). **Failure:** a prose answer with no card means the agent was started with `agent-server.ts` instead of `harness-server.ts`, or the model skipped the tool (§9.3).
**`/generative-ui/state-rendering`**: **Expected now:** "Idle". Progress appears only if the model chooses the generic state tool (§9.3, §9.4).
**`/generative-ui/mcp-apps`**: needs `npm run mcp:apps`. **Try:** `What time is it on the server?` **Pass:** a tool call, then an inline iframe app.

### Generative UI › Components (Vue tab of the `/claude-sdk-typescript/generative-ui/components` pages)
All run on `default`, the Quickstart agent, which receives both the `render_ui` tool and its guide (§9.15). Whether the model renders well is not yet checked against a live model.
**`/generative-ui/components`**: the overview's `App.vue` with the standard catalog. It calls `:8200` directly, as published. **Try:** `Compare the Starter, Team, and Enterprise plans in a table`. **Pass:** a table component in the chat.
**`/generative-ui/components/catalogs`**: your own catalog (`ProductGrid`, `ProductCard`). **Try:** `Show me two products`. **Pass:** a grid of product cards.
**`/generative-ui/components/surfaces`**: a page target (`featured`) above the chat; its default content is a **stand-in** `ProductRow`. **Pass:** the agent replaces it with a ProductGrid.
**`/generative-ui/components/standard-catalog`**: the standard catalog, and a sample that replaces `Card` with `MyCard`.
**`/generative-ui/components/state-and-actions`**: `ProductCard` with "Add to cart" (an `onAddToCart` event bound to an `addToCart` function). The handler sample needs `./cart-store`, which isn't published, so clicking takes the card's error path.
**`/generative-ui/components/theming`**: standard components in the amber accent and 10px radius.
**`/generative-ui/components/transports`**: tool, markdown and `agentIds: ['shop']` samples.
**`/generative-ui/components/markdown-mode`**: the guide travels in context, which the adapter appends to the system prompt, so the agent can answer with `a2ui` blocks. The `sendContext: false` sample puts the guide only in forwarded props, which no published Claude Agent SDK code reads; the captured request carried no guide.
**`/generative-ui/components/from-a2ui`**: the "After" provider; `Airport` and `Arrow` are **stand-ins**.

### Interactivity
**`/shared-state`**: **Try:** **Prefer concise answers**, then `Remember that I like tea`. **Pass:** `preferences.tone` appears in the agent state (Inspector › State). Notes fill only if the model uses `ag_ui_update_state` (§9.4).
**`/shared-state/rendering-in-app`**: **Try:** `Rename the project to "Spring release"`. **Pass (if the model uses the generic state tool):** the heading changes. Otherwise it stays "Project launch" (§9.4).
**`/shared-state/streaming`**: **Expected now:** "Waiting for a draft…". At most a whole document appears at once; nothing streams (§9.3).
**`/shared-state/agent-readonly`**: **Try:** `Which workspace am I in?` **Pass:** "northstar".
**`/human-in-the-loop`**: **Try:** `Schedule a meeting about Q3 planning with Dana`. **Pass:** a time-picker card (flagged stand-in); picking a slot resumes the run.
**`/human-in-the-loop/governed-actions`**: **Try:** `Refund $40 to customer 1182. Call approve_governed_action first with id a-1, tool send_refund, reference POL-7, verdict require_approval.` **Pass:** an approval card.
**`/human-in-the-loop/useInterrupt`**, **`/human-in-the-loop/headless`**: **Expected now:** no interrupt (§9.5).
**`/webmcp`**: stand-in sample only (your choice). In Chrome 149+ with WebMCP, **Run tool** `searchOrders` `{"status":"open"}` returns ORD-1001 and ORD-1004.

### Agent capabilities
**`/multi-agent/subagents`**: notes only (§9.3).

---

## 8. Testing checklist / current status

| Doc page | Route | Status | Notes |
|---|---|---|---|
| `/vue/claude-sdk-typescript` | `/` | 📖 Reference | Landing page. |
| `/vue/claude-sdk-typescript` (Quickstart) | `/quickstart` | ✅ Working | Chain verified to the model call (captured locally); needs the flagged peer-version pin (§9.2). |
| `prebuilt-components` | same | ✅ Working | Only `CopilotChat` has code. |
| `custom-look-and-feel/slots` | same | ⚠️ Partial | Imports added to fragments; 2 stand-ins; `labels` type error; disclaimer never renders (§9.10, §9.11). |
| `custom-look-and-feel/headless-ui` | same | ✅ Working | |
| `programmatic-control` | same | ✅ Working | Default sample adds a harness chat (on request). |
| `prebuilt-components/copilot-threads-drawer` | same | ⚠️ Partial | Intelligence quickstart runtime, fixed local identity; needs a key (§9.7). |
| `headless-threads` | same | ⚠️ Partial | Same runtime (§9.7). |
| `frontend-tools` | same | ✅ Working | Adapter exposes the tool (captured). Not yet run against a live model. |
| `generative-ui/tool-based` | same | ✅ Working | Same. |
| `generative-ui/tool-rendering` | same | ✅ Working | The page's `get_weather` (unchanged) runs on `/tool-rendering` via `/api/copilotkit-tool-rendering`; harness maps the MCP tool name back to `get_weather`. `WeatherToolCard` heading empty (doc bug). Fake-key run only (§9.3). |
| `generative-ui/state-rendering` | same | ⚠️ Partial | No backend writes these keys; only the generic state tool could (§9.3, §9.4). |
| `generative-ui/mcp-apps` | same | ⚠️ Partial | Needs `npm run mcp:apps`; placeholder URL replaced (§9.8). |
| `/claude-sdk-typescript/generative-ui/components` | same | ⚠️ Partial | `App.vue` verbatim + chart/map plugins; tool + guide reach the model (captured); not driven live (§9.15). |
| `…/components/surfaces` | same | ⚠️ Partial | `ProductRow` stand-in; not driven live. |
| `…/components/catalogs` | same | ⚠️ Partial | Provider line wrapped with a chat; fake-key run captured `render_ui` + guide; not driven live. |
| `…/components/standard-catalog` | same | ⚠️ Partial | Not driven live. |
| `…/components/state-and-actions` | same | ⚠️ Partial | `./cart-store` never published; not driven live. |
| `…/components/theming` | same | ⚠️ Partial | Not driven live. |
| `…/components/transports` | same | ⚠️ Partial | Tool and markdown: tool/guide reach the model; not driven live. |
| `…/components/markdown-mode` | same | ⚠️ Partial | Guide reaches the model via the system prompt; the `sendContext: false` sample sends none (§9.15). |
| `…/components/from-a2ui` | same | ⚠️ Partial | `Airport`/`Arrow` stand-ins; not driven live. |
| `shared-state` | same | ⚠️ Partial | Read + tone write-back; notes only via the generic state tool (§9.4). |
| `shared-state/rendering-in-app` | same | ⚠️ Partial | Canvas renders; agent writes only via the generic state tool (§9.4). |
| `shared-state/streaming` | same | ⚠️ Partial | Streaming backend is a snippet with no agent; no token streaming (§9.3). |
| `shared-state/agent-readonly` | same | ✅ Working | Adapter puts context in the system prompt (captured). |
| `human-in-the-loop` | same | ⚠️ Partial | Adapter exposes the tool; `TimePickerCard` stand-in; page also prints React code (§9.9). |
| `human-in-the-loop/useInterrupt` | same | ❌ Broken | No interrupting agent published; `MeetingChat.vue` stand-in (§9.5). |
| `human-in-the-loop/headless` | same | ❌ Broken | Same; `HeadlessInterruptPanel.vue` stand-in (§9.5). |
| `human-in-the-loop/governed-actions` | same | ⚠️ Partial | Tool half exposed; interrupt half §9.5; `executeSideEffect` undefined. |
| `webmcp` | same | ⚠️ Partial | Stand-in sample only; as published every call errors (§9.6). |
| `multi-agent/subagents` | same | ❌ Broken | Raw-Anthropic fragments, no supervisor loop; no Vue code (§9.3). |

**Legend:** ✅ Working · ⚠️ Partial · 📖 Reference · 🚧 Not started · ❌ Broken. "Working" means wired and verified from code, mounts, and the fake-key run; **not yet driven against a live model.**

---

## 9. Known issues / doc-vs-implementation discrepancies

All against `@copilotkit/vue` / `@copilotkit/runtime` 1.87.0, `@ag-ui/claude-agent-sdk` 0.0.9, `@anthropic-ai/claude-agent-sdk` 0.3.306, and the docs as of the 2026-11-13 baseline.

**1. The Quickstart is split across three pages.** `/vue/claude-sdk-typescript/quickstart` redirects (307) to the landing page. The root `.md` is the built-in Vue Quickstart (`BuiltInAgent`), rendered on `/vue`. The landing page renders a single code block, the runtime route, which appears in no `.md`. The agent is on the non-Vue `/claude-sdk-typescript/quickstart` "Use an existing agent" tab, which renders client-side (verified through `data-raw-code`). That page carries both its own Quickstart and a "Backend tools and state" section printing `claude-agent-sdk-adapter.ts` (`createClaudeAgentAdapter`, `runWithClaudeAgentSdk`).

**2. The TypeScript Quickstart's install line fails as published (one harness fix, your choice).** It runs `npm install @anthropic-ai/claude-agent-sdk@^0.2.58 @anthropic-ai/sdk @ag-ui/claude-agent-sdk @ag-ui/core @ag-ui/encoder express dotenv zod`. The current `@ag-ui/claude-agent-sdk` (0.0.9) declares `@anthropic-ai/claude-agent-sdk` **0.3.306** as an exact peer, so npm stops with `ERESOLVE`. Forcing the doc's pin with `--legacy-peer-deps` installs, but the adapter then fails to load (`Cannot find module '@ag-ui/client'`). At your request ("Flagged peer-version fix"), this repo installs `@anthropic-ai/claude-agent-sdk@0.3.306` (pinned exactly in `agent/package.json`); every other package and `agent-server.ts` are as published.

**3. The page backends are incomplete, or for a different path.**
- [Tool Rendering](https://docs.copilotkit.ai/vue/claude-sdk-typescript/generative-ui/tool-rendering) prints `weather-tool-backend.snippet.ts`: a complete `GET_WEATHER_TOOL` schema and `getWeather` handler. The only published way to attach it is `claude-agent-sdk-adapter.ts` (`createClaudeAgentAdapter`, `buildBackendToolServer`), which uses `normalizeClaudeAgentSdkModel`, `zodShapeFromJsonSchema`, `Emit` and `ExecuteTool`; no page defines them. **Served and working since 2026-11-17, at your request:**
  - *Published file:* the doc generator writes it verbatim to `agent/src/app/demos/tool-rendering/weather-tool-backend.snippet.ts`; `agent/src/harness-server.ts` imports it unchanged.
  - *Agent:* a second `ClaudeAgentAdapter` with the Quickstart's options, plus an in-process MCP server named `copilotkit` (the excerpt's `COPILOTKIT_MCP_SERVER_NAME`) in `mcpServers`, with the tool granted in `allowedTools`, as `buildBackendToolServer` does.
  - *Glue [harness]:* a small JSON-schema → zod converter (the SDK's `tool()` takes a zod shape; the published `zodShapeFromJsonSchema` is never defined), and a handler that returns `getWeather(location)` as JSON text.
  - *Route:* `agent-server.ts` creates its Express app internally and doesn't export it. So `harness-server.ts` wraps Express's `application.listen` once, before loading `agent-server.ts`; when the Quickstart's app starts listening, `POST /tool-rendering` (same shape as its `POST /`) is mounted on it first. No second server; `agent-server.ts` is unchanged.
  - *Runtime:* `backend/runtimes/tool-rendering.ts` serves `default` → `AGENT_URL + "tool-rendering"` at `/api/copilotkit-tool-rendering`; the three Tool Rendering `App.vue` files point there (published `runtime-url` kept as a comment). Every other route keeps the Quickstart agent.
  - *Tool name (finding, fixed in the harness):* the model calls `mcp__copilotkit__get_weather`, and the adapter strips only its own `mcp__ag_ui__` prefix, so the page's `useRenderTool({ name: "get_weather" })` would never match. The server can't be named `ag_ui` (the adapter replaces that key with its own frontend-tool server). The endpoint renames this server's calls back to `get_weather` in `TOOL_CALL_START` and `MESSAGES_SNAPSHOT`; nothing else changes. Raw SDK pass-through `CUSTOM` events (`system:init`, `claude:assistant_content`) still show the prefixed name; no renderer reads them.
  - *Verified (2026-11-17, fake key, local stand-in Anthropic API, test ports):* zero-config drew `get_weather · Done`; catch-all drew the stand-in with `{"city":"Paris","temperature":68,…}`; per-tool drew `WeatherToolCard` (`<article name="get_weather">`) with that JSON and an empty heading (doc bug: `parameters.city` vs the tool's `location`). A second message in the same chat ran cleanly in all three; no browser errors. Not yet driven against a live model.
- [State Rendering](https://docs.copilotkit.ai/vue/claude-sdk-typescript/generative-ui/state-rendering) and [State Streaming](https://docs.copilotkit.ai/vue/claude-sdk-typescript/shared-state/streaming) print a 14-line excerpt of a streaming loop and `state-streaming-backend.snippet.ts`, a complete helper that turns a raw Anthropic stream into `document` snapshots. No agent or route uses it.
- [Shared State](https://docs.copilotkit.ai/vue/claude-sdk-typescript/shared-state) prints its read/write agent in seven pieces: a prompt module, an Express route, `shouldUseClaudeAgentSdk`, the adapter helpers, and branches of an `agent_server.ts` loop. They call `runAgenticLoop`, `coercePreferences`, `runWithClaudeAgentSdk` and `executeBackendTool`, none printed on that page. `shouldUseClaudeAgentSdk`'s comment says the Claude Agent SDK path "does not yet bridge CopilotKit frontend/runtime tools back through AG-UI". The installed adapter does: the captured request carried `mcp__ag_ui__show_x`.
- [Sub-agents](https://docs.copilotkit.ai/vue/claude-sdk-typescript/multi-agent/subagents) prints `src/agent/subagents-prompts.ts` (prompts and delegation tool schemas); the run loop in `agent_server.ts` is never printed. "Rendering a live delegation log" publishes no Vue code.

By your rules these are gaps: shown on their routes, not served. Even wired, the streaming helper writes `document`, while State Rendering's `ResearchProgress.vue` reads `status`, `completed`, `total` and `draft`.

**4. Shared state through the adapter, not the docs.** No page publishes a backend that writes state for these routes, so `researcher`, `workspace`, `writer` and `default` are the Quickstart agent. Its adapter, `@ag-ui/claude-agent-sdk`, adds the run's state to the system prompt and a generic `ag_ui_update_state` tool whenever a run carries state (verified by capturing the model request). The Canvas, the notes list, `ResearchProgress` and `StreamingDocument` can therefore change if the model chooses that tool, as one snapshot at the end of the call. Nothing streams, and no page's code prompts for it, so these routes are ⚠️ Partial rather than working.

**5. Interrupts.** [Pausing the Agent for Input](https://docs.copilotkit.ai/vue/claude-sdk-typescript/human-in-the-loop/useInterrupt) publishes `ApprovalPanel.vue` and an `App.vue` that imports a `MeetingChat.vue` it never publishes. [Headless Interrupts](https://docs.copilotkit.ai/vue/claude-sdk-typescript/human-in-the-loop/headless) publishes only an `App.vue` that imports a never-published `HeadlessInterruptPanel.vue`. Both are flagged stand-ins (the files can't compile without them). No Claude agent that interrupts is published, so no interrupt can fire.

**6. Undefined functions left undefined.** `searchOrders` (WebMCP: as published every call throws; the demo shows only a flagged stand-in sample, your choice), `executeSideEffect` (Governed Actions), the backend helpers in §9.3, and on the Components pages `useCartStore` (`./cart-store`) and `vueBasicCatalog`.

**7. Threads: Intelligence quickstart runtime.** Wired per the [Vue Claude Agent SDK (TypeScript) Intelligence quickstart](https://docs.copilotkit.ai/vue/claude-sdk-typescript/intelligence/quickstart) (identical to the other frameworks' apart from the slug). Its `authenticateApplicationUser` is never defined; per that page's "a fixed identity is suitable only for a local, single-user demo", it returns `local-user` / "Local user" (flagged, **not authentication**). Without `CPK_INTELLIGENCE_API_KEY` the path is plain SSE, and the runtime logs that `GET /threads` returns 403. Restart the backend after `project select`. The Threads `App.vue` files use `/api/copilotkit-threads` (published value kept as a comment).

**8. MCP Apps.** The published server URL is a placeholder, replaced by the page's own `http://localhost:3101/mcp` example served by `npm run mcp:apps`. It runs on its own runtime path because `mcpApps` applies to every agent on a runtime; both `App.vue` `runtime-url`s are changed (labelled).

**9. HITL Overview prints React code.** Its first block, titled `page.tsx - useHumanInTheLoop`, is a React snippet (`agentId: "hitl-in-chat"`, a `book_call` tool, a JSX `TimePickerCard` render). It can't run in a Vue app and is shown only. The Vue `MeetingApproval.vue` on the same page is mounted.

**10. Type errors in published doc code** (`npm run type-check`, 9 errors): the `labels` prop is typed as literal default strings; `useRenderTool`, `useDefaultRenderTool` and `useHumanInTheLoop` reject render components that declare only the props they use; `searchOrders` ×2; Surfaces' `FeaturedProducts.vue` imports `../product`, a type module no page publishes. `npm run build` is `vite build`.

**11. Slots › Disclaimer never renders.** `CopilotChat`'s `#input` slot props don't include `showDisclaimer`, so the sample's `CopilotChatInput` never shows its `#disclaimer` slot. Left as published.

**12. Fragments, stand-ins and wrappers.** Slots' fragments get imports only, and "Three levels" is nested in "Two levels". Headless UI's `RenderedMessages.vue` is mounted with the minimal `HeadlessChat.vue` as its composer. Shared State's two `SharedWorkspace.vue` fragments are merged. Stand-ins: `TimePickerCard.vue`, `MeetingChat.vue`, `HeadlessInterruptPanel.vue`, `CustomMessageView`, `CustomToolbarAction`, `BrandedToolCard`, `searchOrders` (on request). `HarnessApp.vue` mounts HITL's `MeetingApproval` beside a chat. **Shown only:** `agent.subscribe`, the watch-sources line, Headless Threads' pagination, `toggleItem`, useInterrupt's multi-interrupt template, and Governed Actions' type and `handleApproval`.

**13. The Claude Agent SDK runs a CLI subprocess, and it may not use your API key.** `ClaudeAgentAdapter` drives the Claude Code CLI bundled with `@anthropic-ai/claude-agent-sdk`. In testing on a machine logged in to Claude Code, a run with a deliberately invalid `ANTHROPIC_API_KEY` still got a real model reply. The CLI evidently authenticated some other way, most likely the local Claude Code login, so **runs can be billed to that login, not to `ANTHROPIC_API_KEY`**. (The Python edition with an older SDK rejected the same fake key.) For key-only billing, run the agent where no Claude Code login exists. The harness's own verification used `ANTHROPIC_BASE_URL` pointed at a local capture server, so no call left the machine.

**14. The harness itself.** There's no root `CopilotKitProvider`: each demo mounts its page's own `App.vue`. Doc sync runs as Vite dev-server middleware and diffs the `.md` of all 31 tracked pages (the 22 Vue pages and the nine Components pages), so changes to the landing runtime block or the Claude Agent SDK Quickstart are invisible to it. `npm run doc-files` re-reads both live. The block-catalog builder reads both backtick and tilde fences (the adapter and HITL blocks are tilde-fenced) and code the rendered page carries in RSC text chunks.

**15. Generative UI › Components (added 2026-11-17).**
- **The pages.** The nine pages live under `/claude-sdk-typescript/generative-ui/components`, not `/vue`, and print each sample in React, Angular, React Native and Vue tabs. Only the Vue tab and untabbed code are used; tab membership is read from the snapshot's `<Tab value="Vue">` markup.
- **The agent (the ms-agent-py choice, same rules).** The overview's Vue setup includes its own runtime: a TanStack `BuiltInAgent` (`@tanstack/ai`, `openaiText("gpt-6-luna")`, `convertInputToTanStackAI`). It's shown on the route and not served. The samples keep `runtime-url="/api/copilotkit"`, so they run on the Claude Agent SDK Quickstart agent.
- **The guide reaches the model.** For a run that carries a catalog, the Copilot Runtime's generative-UI middleware adds `render_ui` to the run's tools and its guide (components, props, how to call the tool) to the run's context (`@copilotkit/runtime` 1.87.0, `generative-ui-middleware`). `@ag-ui/claude-agent-sdk` serves the tool from its in-process MCP server and appends the context to the system prompt. **Captured 2026-11-17** with a fake key and a local stand-in for the Anthropic API (`ANTHROPIC_BASE_URL`, telemetry off):
  - Catalogs sent `mcp__ag_ui__render_ui` with the guide in the system prompt.
  - Transports › markdown and Markdown mode sent the markdown guide.
  - `sendContext: false` sent neither.
  - When the stand-in model called `mcp__ag_ui__render_ui`, the adapter emitted `TOOL_CALL_START render_ui` and ended the run for the client, which is what the runtime's middleware handles.

  Not yet checked against a live model.
- **What the harness wrote, all flagged:**
  - Five pages print only an opening `<CopilotKitProvider …>` line (Catalogs, Transports ×3, Markdown mode's `sendContext: false`, Adopt from A2UI's "After"). The harness adds the imports, a `<CopilotChat />` and the closing tag.
  - Three pages print a provider component with a `<slot />` (Standard catalog, Theming, Markdown mode's `App.vue`). The harness puts a `<CopilotChat />` in the slot.
  - Surfaces, Standard catalog's override and State and actions get small harness pages that put the published pieces together.
  - Two modules printed without imports (State and actions' `shop-ui.ts`, Adopt from A2UI's `app-ui.ts`) get only their import lines.
  - Surfaces' `FeaturedProducts.vue` imports `../shop-ui`, which that page never prints. The Catalogs page's `shop-ui.ts` (same `acme/shop@1`) and its two components are copied there, labelled.
  - The overview's plugin entry (`GenerativeUIChart`, `GenerativeUIMap`) is applied in the harness's `src/main.ts`, and `chart.js` and `maplibre-gl` are installed as the page says.
- **Stand-ins (flagged):** `ProductRow` (Surfaces), `Airport` and `Arrow` (Adopt from A2UI).
- **Shown only:**
  - Catalogs' type-error demo and its `exportA2UICatalog` script;
  - Surfaces' recommendations sample (`Product` type never published);
  - State and actions' cart samples (`./cart-store` never published);
  - Theming's `index.html` dark-mode script, since it would affect every route;
  - Markdown mode's backend fragment (`MY_PROMPT` undefined);
  - Adopt from A2UI's "Before" (`vueBasicCatalog` undefined).

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Connection refused, or `RUN_ERROR` naming the agent URL | Agent not running, or `AGENT_URL` unset | Start terminal 1; set `AGENT_URL` in `backend/.env`; restart the backend. |
| `RUN_ERROR "HTTP 404"` | Another server holds port 8000 | Set `AGENT_PORT` and update `AGENT_URL`. |
| `RUN_ERROR "Invalid API key"` | `ANTHROPIC_API_KEY` missing or wrong in **`agent/.env`** | Fix it and restart the agent (`agent-server.ts` reads `.env` at start). |
| `npm install` in `agent/` fails with `ERESOLVE` | `@anthropic-ai/claude-agent-sdk` not pinned to the adapter's peer | Keep `0.3.306` in `agent/package.json` (§9.2). |
| Replies with an invalid key | The CLI used another credential (§9.13) | Expected on a machine with a Claude Code login. |
| `Agent … not found` | Backend isn't this repo's `server.ts` | Run `backend/server.ts`. |
| Threads stay on "Loading threads…" | Runtime started before the key existed (SSE → 403) | Restart the backend; the startup line must say `(intelligence)`. |
| CORS error on `/quickstart` or `/generative-ui/components` | Those `App.vue` files call `:8200` directly | Keep `cors: true`. |
| `Port 5173 is in use` | Another harness's Vite | Stop it (one harness at a time on 5173/8200). |
| Tool Rendering only: `RUN_ERROR "HTTP 404"` (or a prose answer and no card) | The agent was started with the Quickstart's `npx tsx src/agent-server.ts`, which has no `/tool-rendering` | Start it with `npx tsx src/harness-server.ts` (§6); every other route works with either. |
| Tool Rendering per-tool: `WeatherToolCard` shows the JSON but no city heading | Doc bug: the card reads `parameters.city`, the published tool's argument is `location` | Expected; left as published (§9.3). |
| `npm run doc-files` stops with `AssertionError: … is not on the rendered page` | A block the generator uses changed on the live site since `doc-snapshot/` (doc drift) | Run `/doc-sync`, review the changes, then `npm run doc-files` again (see Doc drift detection). |

---

## Doc drift detection

`/doc-sync` fetches the `.md` behind all 31 tracked pages, diffs each against `doc-snapshot/pages/`, replaces the snapshot, and ranks changes High/Medium/Low. Commit `pages/`, `manifest.json` and `CHANGELOG.md`; `reports/` is gitignored. **Regenerating the doc files:** `cd frontend && npm run doc-files` rebuilds the block catalog (snapshot pages, plus the Claude Agent SDK Quickstart fetched live, every block checked against the rendered page). It then rewrites the verbatim doc files (`write-genui-files.py` writes the Components routes' files), `src/lib/published.json`, `agent/src/agent-server.ts` and Tool Rendering's `agent/src/app/demos/tool-rendering/weather-tool-backend.snippet.ts`.

**Pending drift (found 2026-11-17, not yet synced).** The live site has changed five blocks this repo mounts since the snapshot: Slots' disclaimer sample (block 2: `CopilotChatInput` now passes `:mode`, `:tools-menu` and `:show-disclaimer="true"`), Programmatic Control's `App.vue` (block 1), useInterrupt's `App.vue` (block 3), Headless HITL's `App.vue` (block 0) and Governed Actions' `GovernedActionCard.vue` (block 4). Until `/doc-sync` updates `doc-snapshot/`, `npm run doc-files` stops on the first of them; the routes still mount the snapshot versions. The Slots change may also bear on its "disclaimer never renders" finding (§9.11).
---

## 11. Project structure

```
claude-sdk-ts/
├── CLAUDE.md · PR_GUIDELINES.md · README.md · .env.example
├── doc-snapshot/                    # pages/*.md + manifest.json — doc-sync baseline
├── agent/                           # Claude Agent SDK (TypeScript, npx tsx) — Express :8000
│   ├── src/agent-server.ts          # ★ Claude Agent SDK Quickstart agent, verbatim
│   ├── src/harness-server.ts        # [harness] entry: agent-server.ts unchanged + POST /tool-rendering (§9.3)
│   ├── src/app/demos/tool-rendering/weather-tool-backend.snippet.ts  # Tool Rendering's get_weather, verbatim
│   └── package.json                 # the Quickstart's npm install lines; [harness] claude-agent-sdk pinned 0.3.306 (§9.2)
├── backend/                         # Copilot Runtime, Node :8200
│   ├── server.ts                    # ★ Vue Quickstart host + landing runtime
│   ├── agents.ts                    # HttpAgent per doc agent id
│   └── runtimes/ threads.ts · mcp-apps.ts · tool-rendering.ts
└── frontend/                        # Vite + Vue 3
    ├── scripts/ build-doc-catalog.py · write-doc-files.py · write-genui-files.py · write-demo-entries.py
    └── src/ lib/nav-config.ts (★ routes + statuses) · lib/published.json (every block, for page backends shown as published) · routes/<doc path>/{Notes.vue, demo-chat/} · …
```

---

## 12. References

**Getting Started**: [Quickstart (landing)](https://docs.copilotkit.ai/vue/claude-sdk-typescript) · [Vue Quickstart (frontend steps)](https://docs.copilotkit.ai/vue) · [Claude Agent SDK Quickstart (agent)](https://docs.copilotkit.ai/claude-sdk-typescript/quickstart)

**Basics**: [Prebuilt Components](https://docs.copilotkit.ai/vue/claude-sdk-typescript/prebuilt-components) · [Slots](https://docs.copilotkit.ai/vue/claude-sdk-typescript/custom-look-and-feel/slots) · [Headless UI](https://docs.copilotkit.ai/vue/claude-sdk-typescript/custom-look-and-feel/headless-ui) · [Programmatic Control](https://docs.copilotkit.ai/vue/claude-sdk-typescript/programmatic-control) · [Threads Drawer](https://docs.copilotkit.ai/vue/claude-sdk-typescript/prebuilt-components/copilot-threads-drawer) · [Headless Threads](https://docs.copilotkit.ai/vue/claude-sdk-typescript/headless-threads) · [Frontend Tools](https://docs.copilotkit.ai/vue/claude-sdk-typescript/frontend-tools)

**Generative UI**: [Components as Tools](https://docs.copilotkit.ai/vue/claude-sdk-typescript/generative-ui/tool-based) · [Tool Call Rendering](https://docs.copilotkit.ai/vue/claude-sdk-typescript/generative-ui/tool-rendering) · [State Rendering](https://docs.copilotkit.ai/vue/claude-sdk-typescript/generative-ui/state-rendering) · [MCP Apps](https://docs.copilotkit.ai/vue/claude-sdk-typescript/generative-ui/mcp-apps)

**Generative UI › Components**: [Components and surfaces](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components) · [Surfaces](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/surfaces) · [Catalogs](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/catalogs) · [Standard catalog](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/standard-catalog) · [State and actions](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/state-and-actions) · [Theming](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/theming) · [Transports](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/transports) · [Markdown mode](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/markdown-mode) · [Adopt from A2UI](https://docs.copilotkit.ai/claude-sdk-typescript/generative-ui/components/from-a2ui)

**Interactivity**: [Shared State](https://docs.copilotkit.ai/vue/claude-sdk-typescript/shared-state) · [Render agent state in your app](https://docs.copilotkit.ai/vue/claude-sdk-typescript/shared-state/rendering-in-app) · [State Streaming](https://docs.copilotkit.ai/vue/claude-sdk-typescript/shared-state/streaming) · [Agent Read-Only Context](https://docs.copilotkit.ai/vue/claude-sdk-typescript/shared-state/agent-readonly) · [HITL Overview](https://docs.copilotkit.ai/vue/claude-sdk-typescript/human-in-the-loop) · [Pausing the Agent for Input](https://docs.copilotkit.ai/vue/claude-sdk-typescript/human-in-the-loop/useInterrupt) · [Headless Interrupts](https://docs.copilotkit.ai/vue/claude-sdk-typescript/human-in-the-loop/headless) · [Governed Action Approval UI](https://docs.copilotkit.ai/vue/claude-sdk-typescript/human-in-the-loop/governed-actions) · [WebMCP](https://docs.copilotkit.ai/vue/claude-sdk-typescript/webmcp)

**Agent capabilities**: [Sub-agents](https://docs.copilotkit.ai/vue/claude-sdk-typescript/multi-agent/subagents)

**Intelligence (Threads routes)**: [Connect Intelligence in 5 minutes](https://docs.copilotkit.ai/vue/claude-sdk-typescript/intelligence/quickstart)
