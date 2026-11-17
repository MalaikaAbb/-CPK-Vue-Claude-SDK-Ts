/**
 * [harness] NOT FROM THE DOCS — the entry this repo runs
 * (`cd agent && npx tsx src/harness-server.ts`).
 *
 * It starts the Claude Agent SDK Quickstart's Express app
 * (src/agent-server.ts, verbatim and unchanged: POST "/", GET /health, port
 * AGENT_PORT/8000) with one more endpoint on that same app, added at the
 * user's request (2026-11-17: Tool Rendering's weather tool, fixed and working):
 *
 * - Tool Rendering publishes src/app/demos/tool-rendering/weather-tool-backend.snippet.ts:
 *   an Anthropic tool schema (GET_WEATHER_TOOL) and its handler (getWeather),
 *   both complete. It is written verbatim by the doc generator and imported
 *   here unchanged.
 * - The page's only way of attaching it is claude-agent-sdk-adapter.ts, whose
 *   excerpts need names no page defines (zodShapeFromJsonSchema,
 *   normalizeClaudeAgentSdkModel, Emit, ExecuteTool, …). So this module attaches
 *   the tool the way those excerpts do: an in-process MCP server named
 *   "copilotkit" (the excerpt's COPILOTKIT_MCP_SERVER_NAME) in `mcpServers`, the
 *   tool granted in `allowedTools`, on a second ClaudeAgentAdapter with the
 *   Quickstart's own options. The JSON-schema → zod step is harness glue.
 * - agent-server.ts creates its app inside the module and doesn't export it.
 *   To add the route without editing it, this module wraps Express's
 *   `application.listen` once, before agent-server.ts loads: when the
 *   Quickstart's app starts listening, POST /tool-rendering is mounted on it
 *   first. No other server is started.
 *
 * Tool name (fixed here, at the user's request): the model calls
 * `mcp__copilotkit__get_weather`, and the adapter strips only its own
 * `mcp__ag_ui__` prefix, so AG-UI events would carry the prefixed name and the
 * page's per-tool `useRenderTool({ name: "get_weather" })` would never match.
 * The server can't be named `ag_ui` (the adapter replaces that key with its own
 * frontend-tool server). So the endpoint renames this server's tool calls back
 * to the published schema's name in TOOL_CALL_START and MESSAGES_SNAPSHOT
 * events; nothing else in the stream changes (README §9).
 */
import express, { type Express, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";
import { ClaudeAgentAdapter } from "@ag-ui/claude-agent-sdk";
import { createSdkMcpServer, tool as sdkTool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// ── The published file, imported unchanged ──────────────────────────────────
import { GET_WEATHER_TOOL, getWeather } from "./app/demos/tool-rendering/weather-tool-backend.snippet";

// ── [harness] glue: the published JSON schema as the zod shape sdkTool takes ──
type JsonProp = { type?: string; description?: string };
function zodShape(schema: { properties?: unknown; required?: string[] | null }): Record<string, z.ZodType> {
  const props = (schema.properties ?? {}) as Record<string, JsonProp>;
  const required = new Set(schema.required ?? []);
  return Object.fromEntries(
    Object.entries(props).map(([key, prop]) => {
      let field: z.ZodType =
        prop.type === "number" || prop.type === "integer" ? z.number()
        : prop.type === "boolean" ? z.boolean()
        : prop.type === "string" ? z.string()
        : z.unknown();
      if (prop.description) field = field.describe(prop.description);
      return [key, required.has(key) ? field : field.optional()];
    }),
  );
}

// ── [harness] the published schema + handler as an SDK MCP tool ─────────────
const getWeatherSdkTool = sdkTool(
  GET_WEATHER_TOOL.name,
  GET_WEATHER_TOOL.description ?? "",
  zodShape(GET_WEATHER_TOOL.input_schema),
  async (args) => ({
    content: [{ type: "text" as const, text: JSON.stringify(getWeather((args as { location: string }).location)) }],
  }),
);

const WEATHER_MCP_SERVER = "copilotkit"; // the excerpt's COPILOTKIT_MCP_SERVER_NAME
const PREFIX = `mcp__${WEATHER_MCP_SERVER}__`;

// [harness] The Quickstart's adapter options (agent-server.ts), plus the weather tool.
const toolRenderingAgent = new ClaudeAgentAdapter({
  agentId: "claude-sdk-typescript",
  model: process.env.CLAUDE_MODEL ?? "claude-opus-4-8",
  systemPrompt: "You are a helpful assistant embedded in a CopilotKit app.",
  tools: [],
  mcpServers: {
    [WEATHER_MCP_SERVER]: createSdkMcpServer({ name: WEATHER_MCP_SERVER, version: "1.0.0", tools: [getWeatherSdkTool] }),
  },
  allowedTools: [`${PREFIX}${GET_WEATHER_TOOL.name}`],
  permissionMode: "dontAsk",
  maxTurns: 10,
});

// ── [harness] the tool's published name in AG-UI events ─────────────────────
const unprefix = (name: string) => (name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name);

function publishedToolNames(event: BaseEvent): BaseEvent {
  if (event.type === EventType.TOOL_CALL_START) {
    const e = event as BaseEvent & { toolCallName: string };
    return { ...e, toolCallName: unprefix(e.toolCallName) } as BaseEvent;
  }
  if (event.type === EventType.MESSAGES_SNAPSHOT) {
    const e = event as BaseEvent & { messages: Array<{ toolCalls?: Array<{ function: { name: string } }> }> };
    return {
      ...e,
      messages: e.messages.map((m) =>
        m.toolCalls
          ? { ...m, toolCalls: m.toolCalls.map((c) => ({ ...c, function: { ...c.function, name: unprefix(c.function.name) } })) }
          : m,
      ),
    } as BaseEvent;
  }
  return event;
}

/** [harness] Same shape as agent-server.ts's POST "/" handler, on the weather adapter. */
function runToolRendering(req: Request, res: Response) {
  const input = req.body as RunAgentInput;
  const runId = input.runId ?? randomUUID();
  const threadId = input.threadId ?? randomUUID();
  const encoder = new EventEncoder();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  toolRenderingAgent.run({ ...input, runId, threadId }).subscribe({
    next: (event) => res.write(encoder.encodeSSE(publishedToolNames(event))),
    error: (error) => {
      console.error("Tool Rendering agent run failed:", error);
      const message = error instanceof Error ? error.message : String(error);
      res.write(encoder.encodeSSE({ type: EventType.RUN_ERROR, runId, threadId, message } as BaseEvent));
      res.end();
    },
    complete: () => res.end(),
  });
}

// ── [harness] mount the route on the Quickstart's app when it starts listening ──
const application = express.application as Express;
const listen = application.listen;
let mounted = false;
application.listen = function (this: Express, ...args: unknown[]) {
  if (!mounted) {
    mounted = true;
    this.post("/tool-rendering", runToolRendering);
  }
  return (listen as (...a: unknown[]) => ReturnType<Express["listen"]>).apply(this, args);
} as Express["listen"];

// The Quickstart's agent server, verbatim — loaded after the hook above.
require("./agent-server");
