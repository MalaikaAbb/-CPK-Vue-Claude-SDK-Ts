# Tool Call Rendering

> Render your agent's tool calls with custom UI components.

## What is this?

Tools are how an LLM invokes predefined, typically-deterministic functions. Tool rendering lets you decide how each of those tool calls appears in the chat. Instead of showing raw JSON, you register a Vue component that draws a branded card for the call (arguments, live status, and the eventual result). This is the **Generative UI** variant CopilotKit calls **tool rendering**.

<Callout type="info">
  **Free course:** See this pattern built end-to-end in [Build Interactive Agents with Generative UI](https://www.deeplearning.ai/short-courses/build-interactive-agents-with-generative-ui/) — a free DeepLearning.AI short course taught by CopilotKit's CEO covering the full Generative UI spectrum (Controlled, Declarative, and Open-Ended).
</Callout>

## When should I use this?

Render tool calls when you want to:

- Show users exactly what tools the agent is invoking and with what arguments
- Display live progress indicators while a tool executes
- Render rich, polished results once a tool completes
- Give tool-heavy agents a transparent, on-brand chat experience

## Default tool rendering (zero-config)

The simplest entry point is `useDefaultRenderTool()` with no arguments. CopilotKit registers its built-in default renderer as the `*` wildcard: every tool call renders as a status card (tool name, live **Running → Done** state, collapsible arguments/result) without you writing any UI.

Without this composable the runtime has no `*` renderer and tool calls are invisible; the user only sees the assistant's final text summary.

```vue title="src/components/AgentExperience.vue"
<script setup lang="ts">
import { CopilotChat, useDefaultRenderTool } from "@copilotkit/vue/v2";

useDefaultRenderTool();
</script>

<template><CopilotChat /></template>
```

## Custom catch-all

Once you want on-brand chrome, pass a `render` component or function to `useDefaultRenderTool`. It's a convenience wrapper around `useRenderTool({ name: "*", ... })`: one wildcard renderer handles every tool call, named or not.

```ts title="src/components/AgentExperience.vue"
useDefaultRenderTool({ render: BrandedToolCard });
```

## Per-tool renderers

The most expressive path is one renderer per tool name. Each renderer receives the tool's parsed arguments, a live `status`, and, once the agent returns, the `result`.

```vue title="src/components/WeatherToolCard.vue"
<script setup lang="ts">
defineProps<{
  parameters: { city?: string };
  status: "inProgress" | "executing" | "complete";
  result?: string;
}>();
</script>

<template>
  <p v-if="status !== 'complete'">Checking {{ parameters.city ?? "…" }}</p>
  <article v-else>
    <strong>{{ parameters.city }}</strong>
    <pre>{{ result }}</pre>
  </article>
</template>
```

```vue title="src/components/AgentExperience.vue"
<script setup lang="ts">
import { z } from "zod";
import { CopilotChat, useDefaultRenderTool, useRenderTool } from "@copilotkit/vue/v2";
import WeatherToolCard from "./WeatherToolCard.vue";

useRenderTool({
  name: "get_weather",
  parameters: z.object({ city: z.string() }),
  render: WeatherToolCard,
});

useDefaultRenderTool(); // wildcard fallback for every other tool
</script>

<template><CopilotChat /></template>
```

`parameters` is partial while arguments stream. Read required fields only after the status advances from `inProgress`. The result is a string when status is `complete`; parse it only if your backend deliberately returns a documented serialized shape.

<Callout type="info">
  The `name` you pass to `useRenderTool` must match the tool name the agent exposes; that's how the runtime routes the call to your component.
</Callout>

Per-tool renderers compose with a catch-all: named renderers claim the "interesting" tools and a wildcard handles everything else. The example registers the built-in wildcard after the named `get_weather` renderer.

If the renderer closes over reactive values, pass Vue watch sources as the second argument:

```ts
useRenderTool({ name: "get_weather", parameters, render: WeatherToolCard }, [locale]);
```

Finally, mount the registration component beneath the provider:

```vue title="src/App.vue"
<script setup lang="ts">
import { CopilotKitProvider } from "@copilotkit/vue/v2";
import AgentExperience from "./components/AgentExperience.vue";
</script>

<template>
  <CopilotKitProvider runtime-url="/api/copilotkit"><AgentExperience /></CopilotKitProvider>
</template>
```

## The backend tool definition

The frontend renderer only sees what the agent sends down. The matching backend must expose a tool named `get_weather`, return structured data, and let the frontend renderer with the same name paint the card. The Vue renderer does not create or execute that backend tool.

The agent must also register this schema as an executable backend tool. This
setup shows the connection.

<Steps>
  <Step>
    ### Connect the adapter to the MCP server

    `buildBackendToolServer` converts the tool schemas from the agent. The
    `ClaudeAgentAdapter` receives the resulting `mcpServers` and
    `allowedTools` values.

    
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

  </Step>

  <Step>
    ### Register the executable tool handlers

    Each schema becomes an `sdkTool` that calls its executable CopilotKit
    handler. `createSdkMcpServer` registers these tools. The allowlist uses
    their fully qualified `mcp__copilotkit__*` names.

    
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
</Steps>

<Callout type="info">
  This MCP path handles compatible requests that use backend tools only.
  Requests with frontend tools, structured user content, or extended thinking
  use the direct Anthropic path. Requests with aimock transport also use this
  fallback.
</Callout>

```typescript
// src/app/demos/tool-rendering/weather-tool-backend.snippet.ts
import type Anthropic from "@anthropic-ai/sdk";

export const GET_WEATHER_TOOL: Anthropic.Tool = {
  name: "get_weather",
  description:
    "Get the current weather for a given location. Useful on its own for " +
    "weather questions, and a great companion to `search_flights`.",
  input_schema: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "The city or region to get weather for.",
      },
    },
    required: ["location"],
  },
};

export function getWeather(location: string): Record<string, unknown> {
  return {
    city: location,
    temperature: 68,
    humidity: 55,
    wind_speed: 10,
    conditions: "Sunny",
  };
}
```

<IntegrationGrid path="generative-ui/tool-rendering" />
