import express from "express";
import { randomUUID } from "node:crypto";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { EventEncoder } from "@ag-ui/encoder";
import { ClaudeAgentAdapter } from "@ag-ui/claude-agent-sdk";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const agent = new ClaudeAgentAdapter({
  agentId: "claude-sdk-typescript",
  model: process.env.CLAUDE_MODEL ?? "claude-opus-4-8",
  systemPrompt: "You are a helpful assistant embedded in a CopilotKit app.",
  tools: [],
  permissionMode: "dontAsk",
  maxTurns: 10,
});

app.post("/", (req, res) => {
  const input = req.body as RunAgentInput;
  const runId = input.runId ?? randomUUID();
  const threadId = input.threadId ?? randomUUID();
  const encoder = new EventEncoder();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  agent.run({ ...input, runId, threadId }).subscribe({
    next: (event) => res.write(encoder.encodeSSE(event)),
    error: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      res.write(
        encoder.encodeSSE({
          type: EventType.RUN_ERROR,
          runId,
          threadId,
          message,
        }),
      );
      res.end();
    },
    complete: () => res.end(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.AGENT_PORT ?? 8000);
app.listen(port, () => {
  console.log(`Claude Agent SDK listening on http://localhost:${port}`);
});
