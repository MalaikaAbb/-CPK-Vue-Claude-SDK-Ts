<script setup lang="ts">
import Callout from "@/components/harness/Callout.vue";
import Panel from "@/components/harness/Panel.vue";
import PublishedCode from "@/components/harness/PublishedCode.vue";
import RouteHeader from "@/components/harness/RouteHeader.vue";
</script>

<template>
  <RouteHeader path="/multi-agent/subagents" />
  <Callout tone="warn" title="Gap: prompts and schemas, no supervisor loop, no frontend (README §9.3)">
    <p>· <code>src/agent/subagents-prompts.ts</code> (printed in two sections) exports the three sub-agent prompts, the supervisor prompt and the delegation tool schemas. The run loop that calls them lives in an <code>agent_server.ts</code> the page never prints. Per your rules nothing was written in its place; it is not served.</p>
    <p>· The “Rendering a live delegation log” section publishes no Vue code, so this route has no demo.</p>
  </Callout>
  <Panel title="Published backend, as printed">
    <div class="space-y-4">
      <PublishedCode page="multi-agent__subagents" :index="1" />
      <PublishedCode page="multi-agent__subagents" :index="2" note="The page prints the supervisor tool schemas a second time (also its first block)." />
    </div>
  </Panel>
</template>
