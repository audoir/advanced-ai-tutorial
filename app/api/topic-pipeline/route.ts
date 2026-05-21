import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { createMCPClient } from "@ai-sdk/mcp";
import { getDb } from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/config";

export const runtime = "nodejs";

// ─── Topic-Based Orchestrator API ────────────────────────────────────────────
//
// Chapter 4: Agent Topics — Persisting Intermediate Outputs in the Database
//
// This is the Chapter 4 counterpart to /api/multi-agent/route.ts (Chapter 1).
//
// The problem with Chapter 1's approach:
//   The Orchestrator Agent passes the output of one agent directly as a string
//   argument to the next agent's tool call. This means:
//     1. The full research report is copy-pasted into the writer_agent call
//     2. The full draft is copy-pasted into the editor_agent call
//     3. Large outputs bloat the Orchestrator's context window
//     4. There's no persistent record of intermediate outputs
//     5. If the pipeline fails mid-way, all intermediate work is lost
//
// The solution — Agent Topics:
//   The specialist agents in /api/mcp/agents-topic/[transport]/route.ts
//   accept a runId instead of full content. Each agent:
//     - Reads its input from the database topic for that runId
//     - Writes its output to the database topic for that runId
//     - Returns only a short confirmation message (not the full content)
//
//   The Orchestrator only passes a short runId string between agents.
//   All large content lives in the agent_topics table in SQLite.
//
// Architecture:
//   Client → POST /api/topic-pipeline { prompt, runId }
//              ↓
//         Orchestrator Agent (gpt + topic-aware agent MCP tools)
//              ↓ calls researcher_agent(topic, runId)
//                  → agent queries DB, writes to topic "research:{runId}"
//                  → returns "Research complete. Topic: research:{runId}"
//              ↓ calls writer_agent(topic, runId)
//                  → agent reads topic "research:{runId}" from DB
//                  → writes to topic "draft:{runId}"
//                  → returns "Draft complete. Topic: draft:{runId}"
//              ↓ calls editor_agent(runId)
//                  → agent reads topic "draft:{runId}" from DB
//                  → writes to topic "final:{runId}"
//                  → returns "Editing complete. Topic: final:{runId}"
//              ↓ Orchestrator streams final summary to user
//
// Compare to Chapter 1 where the Orchestrator's context contained:
//   [tool result: "...2,000 chars of research..."]
//   [tool call: writer_agent(topic, "...2,000 chars pasted again...")]
//   [tool result: "...3,000 chars of draft..."]
//   [tool call: editor_agent("...3,000 chars pasted again...")]
//
// In Chapter 4, the Orchestrator's context only contains:
//   [tool result: "Research complete. Topic: research:run_abc (1842 chars)"]
//   [tool call: writer_agent("electronics", "run_abc")]
//   [tool result: "Draft complete. Topic: draft:run_abc (2931 chars)"]
//   [tool call: editor_agent("run_abc")]
// ─────────────────────────────────────────────────────────────────────────────

// ── Topic read helper (for the GET endpoint) ──────────────────────────────────

function ensureTopicsTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_topics (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      topic_name TEXT NOT NULL,
      content TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(run_id, topic_name)
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_topics_run_id
    ON agent_topics(run_id)
  `);
}

// ── POST /api/topic-pipeline ──────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, runId } = body as { prompt: string; runId: string };

  if (!prompt || !runId) {
    return new Response(
      JSON.stringify({ error: "prompt and runId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Connect to the topic-aware Agent MCP server.
  // These agents accept a runId and read/write topics in the database
  // instead of receiving/returning large content strings.
  const agentMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents-topic/mcp",
    },
  });

  const agentTools = await agentMcpClient.tools();

  // Build a tool summary for the system prompt
  const toolSummary = Object.entries(agentTools)
    .map(([name, tool]) => `- **${name}**: ${tool.description ?? ""}`)
    .join("\n");

  const result = streamText({
    model: openai(DEFAULT_MODEL),
    system: `You are an Orchestrator Agent that manages a team of specialist AI agents.

You have the following topic-aware specialist agents available as tools:
${toolSummary}

IMPORTANT — How topics work:
- Each agent reads its input from a named topic in the database and writes its output to another named topic.
- You tell each agent which topic to read from (readTopic) and which topic to write to (writeTopic).
- You only need to pass the runId and short topic names between agents — never copy-paste content.
- Topic names are short strings like "research", "draft", "final".

The runId for this pipeline run is: "${runId}"

Your job is to:
1. Call researcher_agent(topic, runId, writeTopic="research") — it will query the database and save research to the "research" topic
2. Call writer_agent(topic, runId, readTopic="research", writeTopic="draft") — it will read from "research" and save a draft to "draft"
3. Call editor_agent(runId, readTopic="draft", writeTopic="final") — it will read from "draft" and save the final article to "final"
4. Summarize what was accomplished for the user

Always explain what you're doing at each step so the user can follow along.
After all agents have completed, let the user know the pipeline is done and all outputs are saved in the database.`,
    messages: [{ role: "user", content: prompt }],
    stopWhen: stepCountIs(20),
    tools: agentTools,
    onFinish: async () => {
      await agentMcpClient.close();
    },
  });

  return result.toUIMessageStreamResponse();
}

// ── GET /api/topic-pipeline?runId=... ────────────────────────────────────────
// Returns all topics for a given runId — useful for polling progress
// or inspecting intermediate outputs after the fact.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return new Response(
      JSON.stringify({ error: "runId query parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  ensureTopicsTable();
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT topic_name, content, agent_name, created_at FROM agent_topics WHERE run_id = ? ORDER BY created_at ASC",
    )
    .all(runId) as {
    topic_name: string;
    content: string;
    agent_name: string;
    created_at: string;
  }[];

  const topics: Record<
    string,
    { content: string; agentName: string; createdAt: string }
  > = {};
  for (const row of rows) {
    topics[row.topic_name] = {
      content: row.content,
      agentName: row.agent_name,
      createdAt: row.created_at,
    };
  }

  return new Response(JSON.stringify({ runId, topics }), {
    headers: { "Content-Type": "application/json" },
  });
}
