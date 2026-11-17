# Shared State

> Create a two-way connection between your UI and agent state.

## What is shared state?

Agentic Copilots maintain a shared state that seamlessly connects your UI with the agent's execution. This shared state system allows you to:

- Display the agent's current progress and intermediate results
- Update the agent's state through UI interactions
- React to state changes in real-time across your application

<ImageZoom
  src="https://cdn.copilotkit.ai/docs/copilotkit/images/coagents/SharedStateCoAgents.gif"
  alt="Shared State Demo"
  width={1000}
  height={1000}
  className="rounded-lg shadow-lg border mt-0"
/>

## When should I use this?

Use shared state when you want the agent and the user to collaborate through the same application state. The agent's outputs are reflected in the UI, and user updates in the UI are reflected in the agent's execution.

<OpsPlatformCTA
  variant="inline"
  title="Building stateful agents?"
  body="Persistent threads ship with CopilotKit Intelligence on the free Developer tier."
  surface="docs_shared_state"
/>

## Reading agent state

<Steps>
  <Step>
    ### Put shared state in the system prompt and tools

    The demo exposes frontend preferences to Claude and gives the agent a tool
    for writing notes back into CopilotKit state. Keep the state contract small,
    typed, and mirrored by the UI components that read the same values.

    
~~~~typescript title="shared-state-read-write-prompt.ts"
export interface Preferences {
  name?: string;
  tone?: "formal" | "casual" | "playful";
  language?: string;
  interests?: string[];
}

export const SHARED_STATE_READ_WRITE_BASE_SYSTEM =
  "You are a helpful, concise assistant. " +
  "The user's preferences are supplied via shared state and will be " +
  "added to the system prompt at the start of every turn. Always " +
  "respect them. " +
  "When the user asks you to remember something, or when you observe " +
  "something worth surfacing in the UI, call `set_notes` with the " +
  "FULL updated list of short note strings (existing notes + new). " +
  "Each note should be under 120 characters.";

export const SET_NOTES_TOOL_SCHEMA = {
  name: "set_notes" as const,
  description:
    "Replace the notes array in shared state with the full updated list. " +
    "Use whenever the user asks you to 'remember' something, or when you " +
    "have an observation worth surfacing in the UI's notes panel. " +
    "Always pass the FULL notes list (existing + new), not a diff. " +
    "Keep each note short (< 120 chars).",
  input_schema: {
    type: "object" as const,
    properties: {
      notes: {
        type: "array",
        items: { type: "string" },
        description:
          "The complete updated notes array. Replaces the current notes.",
      },
    },
    required: ["notes"],
  },
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Coerce an arbitrary `unknown` (e.g. `input.state.preferences`) into a
 * sanitized `Preferences` object. We accept partial shapes — any field
 * may be missing — and silently drop fields that don't match the
 * expected types so a misbehaving frontend can't poison the prompt.
 */
export function coercePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object") return {};
  const v = value as Record<string, unknown>;
  const out: Preferences = {};
  if (typeof v.name === "string") out.name = v.name;
  if (v.tone === "formal" || v.tone === "casual" || v.tone === "playful") {
    out.tone = v.tone;
  }
  if (typeof v.language === "string") out.language = v.language;
  if (isStringArray(v.interests)) out.interests = v.interests;
  return out;
}

export function buildPreferencesPreamble(prefs: Preferences): string | null {
  const lines: string[] = [];
  if (prefs.name) lines.push(`- Name: ${prefs.name}`);
  if (prefs.tone) lines.push(`- Preferred tone: ${prefs.tone}`);
  if (prefs.language) lines.push(`- Preferred language: ${prefs.language}`);
  if (prefs.interests && prefs.interests.length > 0) {
    lines.push(`- Interests: ${prefs.interests.join(", ")}`);
  }
  if (lines.length === 0) return null;
  return [
    "The user has shared these preferences with you:",
    ...lines,
    "Tailor every response to these preferences. Address the user by name " +
      "when appropriate.",
  ].join("\n");
}

export function buildSharedStateReadWriteSystemPrompt(
  prefs: Preferences,
): string {
  const preamble = buildPreferencesPreamble(prefs);
  if (!preamble) return SHARED_STATE_READ_WRITE_BASE_SYSTEM;
  return `${SHARED_STATE_READ_WRITE_BASE_SYSTEM}\n\n${preamble}`;
}
~~~~

  </Step>

  <Step>
    ### Pass the schema to the shared agent loop

    The route reads the current preferences and notes, then registers
    `SET_NOTES_TOOL_SCHEMA` with `runAgenticLoop`.

    
~~~~typescript title="agent_server.ts"
app.post(
  "/shared-state-read-write",
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as RunAgentInput;
    const incomingState =
      ((input as any).state as Record<string, unknown> | undefined) ?? {};
    const prefs = coercePreferences(incomingState.preferences);
    const notes = Array.isArray(incomingState.notes)
      ? (incomingState.notes as unknown[]).filter(
          (n): n is string => typeof n === "string",
        )
      : [];
    await runAgenticLoop(req, res, {
      systemPrompt: buildSharedStateReadWriteSystemPrompt(prefs),
      toolSchemas: [SET_NOTES_TOOL_SCHEMA] as Anthropic.Tool[],
      initialState: { preferences: prefs, notes },
    });
  },
);
~~~~

  </Step>

  <Step>
    ### Select the Claude Agent SDK path

    Compatible requests use `runWithClaudeAgentSdk`. Requests with aimock
    transport, frontend/runtime tools, extended thinking, or structured user
    content use the direct Anthropic Messages API fallback.

    
~~~~typescript title="claude-agent-sdk-adapter.ts"
export function shouldUseClaudeAgentSdk({
  input,
  forwardedHeaders,
  runtimeToolCount,
  enableThinking,
}: {
  input: RunAgentInput;
  forwardedHeaders: Record<string, string>;
  runtimeToolCount: number;
  enableThinking?: boolean;
}): boolean {
  if ((process.env.ANTHROPIC_BASE_URL ?? "").includes("aimock")) {
    return false;
  }
  // The official adapter keeps a `headers` property for forward compatibility,
  // but the Claude Agent SDK cannot forward per-request HTTP headers today.
  if (hasHeader(forwardedHeaders, "x-aimock-context")) {
    return false;
  }
  if (enableThinking) {
    return false;
  }
  // The official Claude Agent SDK path can execute backend MCP tools, but it
  // does not yet bridge CopilotKit frontend/runtime tools back through AG-UI.
  if (runtimeToolCount > 0) {
    return false;
  }
  if (hasStructuredUserContent(input)) {
    return false;
  }
  return true;
}
~~~~


    
~~~~typescript title="agent_server.ts"
  if (
    shouldUseClaudeAgentSdk({
      input,
      forwardedHeaders,
      runtimeToolCount: runtimeTools.length,
      enableThinking: config.enableThinking,
    })
  ) {
    await runWithClaudeAgentSdk({
      input,
      emit,
      runId,
      threadId,
      systemPrompt,
      toolSchemas: config.toolSchemas,
      initialState: state,
      model: config.model ?? CLAUDE_MODEL,
      forwardedHeaders,
      executeTool: (toolName, toolInput, currentState, toolEmit) =>
        executeBackendTool(
          toolName,
          toolInput,
          currentState,
          toolEmit,
          forwardedHeaders,
          contextString,
        ),
    });
    res.end();
    return;
  }
~~~~

  </Step>

  <Step>
    ### Expose `set_notes` through MCP

    The adapter receives the in-process MCP server and its `allowedTools`
    list. The schema becomes an executable SDK tool named
    `mcp__copilotkit__set_notes`.

    
~~~~typescript title="claude-agent-sdk-adapter.ts"
function createClaudeAgentAdapter({
  toolSchemas,
  emit,
  getState,
  setState,
  executeTool,
  model,
  systemPrompt,
}: {
  toolSchemas: Anthropic.Tool[];
  emit: Emit;
  getState: () => Record<string, unknown>;
  setState: (state: Record<string, unknown>) => void;
  executeTool: ExecuteTool;
  model: string;
  systemPrompt: string;
}) {
  const backendToolServer = buildBackendToolServer({
    toolSchemas,
    emit,
    getState,
    setState,
    executeTool,
  });

  return new ClaudeAgentAdapter({
    agentId: "claude-sdk-typescript",
    model: normalizeClaudeAgentSdkModel(model),
    systemPrompt,
    tools: [],
    mcpServers: backendToolServer.mcpServers,
    allowedTools: backendToolServer.allowedTools,
    permissionMode: "dontAsk",
    maxTurns: 10,
  });
}
~~~~


    
~~~~typescript title="claude-agent-sdk-adapter.ts"
const COPILOTKIT_MCP_SERVER_NAME = "copilotkit";
const COPILOTKIT_TOOL_PREFIX = `mcp__${COPILOTKIT_MCP_SERVER_NAME}__`;

function buildBackendToolServer({
  toolSchemas,
  emit,
  getState,
  setState,
  executeTool,
}: {
  toolSchemas: Anthropic.Tool[];
  emit: Emit;
  getState: () => Record<string, unknown>;
  setState: (state: Record<string, unknown>) => void;
  executeTool: ExecuteTool;
}): {
  mcpServers?: Record<string, McpServerConfig>;
  allowedTools: string[];
} {
  if (toolSchemas.length === 0) {
    return { allowedTools: [] };
  }

  const tools = toolSchemas.map((schema) =>
    sdkTool(
      schema.name,
      schema.description ?? "",
      zodShapeFromJsonSchema(schema.input_schema),
      async (args) => {
        try {
          const result = await executeTool(
            schema.name,
            args as Record<string, unknown>,
            getState(),
            emit,
          );
          if (result.state) {
            setState(result.state);
          }
          return {
            content: [{ type: "text" as const, text: result.resultText }],
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text" as const, text: message }],
            isError: true,
          };
        }
      },
    ),
  );

  return {
    mcpServers: {
      [COPILOTKIT_MCP_SERVER_NAME]: createSdkMcpServer({
        name: COPILOTKIT_MCP_SERVER_NAME,
        version: "1.0.0",
        tools,
      }),
    },
    allowedTools: toolSchemas.map(
      (schema) => `${COPILOTKIT_TOOL_PREFIX}${schema.name}`,
    ),
  };
}
~~~~

  </Step>

  <Step>
    ### Replace the notes in shared state

    The backend handler validates the tool arguments and returns the updated
    state. The adapter emits that state as a snapshot after the tool result.

    
~~~~typescript title="agent_server.ts"
  if (toolName === "set_notes") {
    const notes = Array.isArray(toolInput.notes)
      ? (toolInput.notes as unknown[]).filter(
          (note): note is string => typeof note === "string",
        )
      : [];
    return {
      resultText: JSON.stringify({ status: "ok", count: notes.length }),
      state: { ...state, notes },
    };
  }
~~~~

  </Step>
</Steps>

Subscribe a component to the agent's state with `useAgent`. Any time the agent mutates its state, for example via a tool call, the composable updates its reactive `agent` ref and your UI re-renders with the new values.

```vue title="src/components/SharedWorkspace.vue"
<script setup lang="ts">
import { computed } from "vue";
import { useAgent, UseAgentUpdate } from "@copilotkit/vue/v2";

type WorkspaceState = {
  notes?: string[];
  preferences?: { tone?: string };
};

const { agent } = useAgent({
  agentId: "workspace",
  updates: [UseAgentUpdate.OnStateChanged],
});
const state = computed(
  () => (agent.value?.state ?? {}) as WorkspaceState,
);
</script>

<template>
  <ul>
    <li v-for="note in state.notes ?? []" :key="note">{{ note }}</li>
  </ul>
</template>
```

The returned `agent.value.state` is a plain object. Read it like any other reactive application data and render the parts you care about: agent-written notes, structured outputs, progress indicators, or anything else the agent has put there.

## Writing agent state

The same agent object exposes `setState`. Calling it from a UI event handler pushes the new value into shared state, and the agent reads it back on its next turn. The UI's writes visibly steer the model.

```vue title="src/components/SharedWorkspace.vue"
<script setup lang="ts">
function setTone(tone: string) {
  const current = agent.value;
  if (!current) return;

  const previous = (current.state ?? {}) as WorkspaceState;
  current.setState({
    ...previous,
    preferences: { ...previous.preferences, tone },
  });
}
</script>

<template>
  <button @click="setTone('concise')">Prefer concise answers</button>
</template>
```

This is what makes the channel two-way: the UI doesn't just observe the agent, it can hand the agent fresh inputs — preferences, selections, or partial work — without going through the chat thread.

## Rendering shared state in the UI

Because `agent.state` is plain data exposed through a Vue ref, the UI layer is ordinary Vue. The example above wires the agent's outputs into a list and feeds user edits back through `setState`.

Nothing about this is chat-specific: `useAgent` works in any component under `CopilotKitProvider`, so you can render agent state in your main view or canvas, not just inside the chat panel. See **[Render agent state in your app](/vue/claude-sdk-typescript/vue/shared-state/rendering-in-app)** for the full main-view pattern.

```vue title="src/App.vue"
<script setup lang="ts">
import { CopilotChat, CopilotKitProvider } from "@copilotkit/vue/v2";
import SharedWorkspace from "./components/SharedWorkspace.vue";
</script>

<template>
  <CopilotKitProvider runtime-url="/api/copilotkit">
    <SharedWorkspace />
    <CopilotChat agent-id="workspace" />
  </CopilotKitProvider>
</template>
```

## Streaming partial state updates

By default, agent state only updates *between* backend checkpoints, so a long-running tool call appears as one big burst at the end. State streaming forwards a specific tool argument straight into a state key *as it's being generated*, so the UI can watch the answer assemble token-by-token.

```typescript
// src/app/demos/shared-state-streaming/state-streaming-backend.snippet.ts
import { EventType } from "@ag-ui/core";
import type Anthropic from "@anthropic-ai/sdk";

type StreamingState = {
  document?: string;
};

type ToolDeltaEvent = {
  type: string;
  content_block?: { type: string; name?: string };
  delta?: { type: string; partial_json?: string };
};

export const WRITE_DOCUMENT_TOOL_SCHEMA: Anthropic.Tool = {
  name: "write_document",
  description: "Write a document into shared agent state.",
  input_schema: {
    type: "object",
    properties: {
      document: {
        type: "string",
        description: "The full document text to render in shared state.",
      },
    },
    required: ["document"],
  },
};

function partialJsonStringProperty(source: string, key: string): string | null {
  // Hand-rolled partial-JSON string extraction with no external dependency
  // (mirrors the Python sibling snippet). Reads the current value of a string
  // property from a partial buffer, tolerating truncation mid-value.
  const marker = JSON.stringify(key);
  const keyPos = source.indexOf(marker);
  if (keyPos < 0) return null;
  const colonPos = source.indexOf(":", keyPos + marker.length);
  if (colonPos < 0) return null;
  const valueStart = source.indexOf('"', colonPos + 1);
  if (valueStart < 0) return null;

  const rawChars: string[] = [];
  let escaped = false;
  for (const char of source.slice(valueStart + 1)) {
    if (escaped) {
      rawChars.push("\\" + char);
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      break;
    } else {
      rawChars.push(char);
    }
  }
  // A buffer truncated mid-escape drops the dangling backslash (matching the
  // Python sibling) so the partial value still parses instead of forcing null.

  try {
    return JSON.parse(`"${rawChars.join("")}"`) as string;
  } catch {
    return null;
  }
}

export function emitStreamingDocumentState(
  event: ToolDeltaEvent,
  tracker: { toolName: string | null; argsJson: string; lastDocument: string },
  state: StreamingState,
  emit: (event: object) => void,
) {
  if (
    event.type === "content_block_start" &&
    event.content_block?.type === "tool_use"
  ) {
    tracker.toolName = event.content_block.name ?? null;
    tracker.argsJson = "";
    return;
  }

  if (
    event.type !== "content_block_delta" ||
    event.delta?.type !== "input_json_delta"
  ) {
    return;
  }

  tracker.argsJson += event.delta.partial_json ?? "";
  if (tracker.toolName !== "write_document") {
    return;
  }

  const streamedDocument = partialJsonStringProperty(
    tracker.argsJson,
    "document",
  );
  if (streamedDocument === null || streamedDocument === tracker.lastDocument) {
    return;
  }

  // Mutate `state` in place but emit a fresh copy each delta, so a consumer
  // that retains a snapshot doesn't see earlier snapshots mutate to the final
  // text as streaming continues. (Mirrors the Python sibling snippet.)
  const snapshot: StreamingState = { ...state, document: streamedDocument };
  state.document = streamedDocument;
  tracker.lastDocument = streamedDocument;
  emit({ type: EventType.STATE_SNAPSHOT, snapshot });
}
```

See **[State streaming](/vue/claude-sdk-typescript/vue/shared-state/streaming)** for the full walkthrough, including the corresponding `useAgent` subscription on the frontend.

## Read-only context

When a value is **UI-owned** and the agent should read it but never write it back, such as current user, selected record, or scroll position, reach for `useAgentContext` instead of full shared state. It publishes values as a one-way UI-to-agent channel that auto-unregisters on unmount.

`useAgentContext` is a separate read-only capability; it does not replace the bidirectional `agent.state` / `agent.setState(...)` contract above.

See **[Agent read-only context](/vue/claude-sdk-typescript/vue/shared-state/agent-readonly)** for the full pattern.

<IntegrationGrid path="shared-state" exclude={["agno", "agent-spec", "spring-ai", "langroid"]} />
