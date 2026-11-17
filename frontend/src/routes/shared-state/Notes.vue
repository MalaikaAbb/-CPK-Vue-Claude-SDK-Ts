<script setup lang="ts">
import Callout from "@/components/harness/Callout.vue";
import Panel from "@/components/harness/Panel.vue";
import PublishedCode from "@/components/harness/PublishedCode.vue";
import RouteHeader from "@/components/harness/RouteHeader.vue";
import SourceCode from "@/components/harness/SourceCode.vue";
import TryIt from "@/components/harness/TryIt.vue";
</script>

<template>
  <RouteHeader path="/shared-state" />
  <Panel title="What it demonstrates">
    <p class="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      Agent <code>workspace</code>'s state read through <code>useAgent</code> and rendered as a notes list, and written back with
      <code>agent.setState</code> from the “Prefer concise answers” button.
    </p>
    <div class="mt-4">
      <TryIt :prompts="['Click “Prefer concise answers”, then ask: Write a two-line poem']" expect="The click writes preferences.tone into the agent state (Inspector › State); the chat replies." fail="The notes list stays empty unless the model chooses the adapter's generic ag_ui_update_state tool — no published backend writes notes for this agent (see below)." />
    </div>
  </Panel>
  <Panel title="The demo">
    <div class="space-y-4">
      <SourceCode file="frontend/src/routes/shared-state/demo-chat/components/SharedWorkspace.vue" />
      <SourceCode file="frontend/src/routes/shared-state/demo-chat/App.vue" />
    </div>
  </Panel>
  <Panel title="The two fragments, as published">
    <div class="space-y-4">
      <PublishedCode page="shared-state" :index="7" />
      <PublishedCode page="shared-state" :index="8" />
    </div>
  </Panel>
  <Callout tone="harness" title="What the harness changed">
    <p>· The page prints <code>SharedWorkspace.vue</code> twice (reading, then writing; the second has no imports and uses <code>agent</code> from the first). Merged into one file, each verbatim.</p>
    <p>· <code>workspace</code> → <code>my_agent</code>, the Claude Agent SDK Quickstart's agent (<code>backend/agents.ts</code>); the page's own backend is fragments.</p>
  </Callout>
  <Panel title="The page's backend, as published — fragments, not served">
    <div class="space-y-4">
      <PublishedCode page="shared-state" :index="0" note="shared-state-read-write-prompt.ts: Preferences, the base prompt, the set_notes tool schema and a prompt builder." />
      <PublishedCode page="shared-state" :index="1" note="agent_server.ts: a POST /shared-state-read-write route calling coercePreferences and runAgenticLoop, which no page defines." />
      <PublishedCode page="shared-state" :index="2" note="claude-agent-sdk-adapter.ts: shouldUseClaudeAgentSdk. Its comment says the Claude Agent SDK path does not bridge frontend tools — but the installed adapter does (README §9.3)." />
      <PublishedCode page="shared-state" :index="3" note="agent_server.ts: the branch that calls runWithClaudeAgentSdk and executeBackendTool, neither defined on this page." />
      <PublishedCode page="shared-state" :index="4" note="createClaudeAgentAdapter (also on Tool Rendering)." />
      <PublishedCode page="shared-state" :index="5" note="buildBackendToolServer (also on Tool Rendering)." />
      <PublishedCode page="shared-state" :index="6" note="agent_server.ts: the set_notes branch of executeBackendTool." />
      <PublishedCode page="shared-state" :index="10" note="state-streaming-backend.snippet.ts, also printed here." />
    </div>
  </Panel>
  <Callout tone="warn" title="Doc note (README §9.3, §9.4)">
    <p>The page's read/write agent is printed in pieces around undefined names (<code>runAgenticLoop</code>, <code>executeBackendTool</code>, <code>normalizeClaudeAgentSdkModel</code>, …), so per your rules it is a gap and <code>workspace</code> is the Quickstart agent. The tone write-back reaches the agent (state is in its system prompt). Nothing publishes the <code>set_notes</code> path for this agent, so notes appear only if the model uses the adapter's generic <code>ag_ui_update_state</code> tool.</p>
  </Callout>
</template>
