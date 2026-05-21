import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { getDb } from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/config";
import {
  RESEARCHER_SYSTEM_PROMPT,
  researcherUserPrompt,
  WRITER_SYSTEM_PROMPT,
  writerUserPrompt,
  EDITOR_SYSTEM_PROMPT,
  editorUserPrompt,
} from "@/lib/prompts";

export const runtime = "nodejs";

// ─── Topic-Aware Agent MCP Server ─────────────────────────────────────────────
//
// Chapter 4: Agent Topics — Topic-Aware Specialist Agents
//
// This is the Chapter 4 version of /api/mcp/agents/[transport]/route.ts.
// The key difference from Chapter 1:
//
//   Chapter 1 agents:
//     researcher_agent(topic)          → returns full research text
//     writer_agent(topic, research)    → receives full research text as arg
//     editor_agent(article)            → receives full draft text as arg
//
//   Chapter 4 agents:
//     researcher_agent(topic, runId)   → writes to topic, returns topicId
//     writer_agent(topic, runId)       → reads research topic, writes draft topic
//     editor_agent(runId)              → reads draft topic, writes final topic
//
// The Orchestrator only passes a short runId string between agents.
// All large content lives in the agent_topics table in SQLite.
// ─────────────────────────────────────────────────────────────────────────────

// ── Topic helpers ─────────────────────────────────────────────────────────────

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

function writeTopic(
  runId: string,
  topicName: string,
  content: string,
  agentName: string,
) {
  const db = getDb();
  ensureTopicsTable();
  const id = `${runId}:${topicName}`;
  db.prepare(`
    INSERT INTO agent_topics (id, run_id, topic_name, content, agent_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(run_id, topic_name) DO UPDATE SET
      content = excluded.content,
      agent_name = excluded.agent_name,
      created_at = datetime('now')
  `).run(id, runId, topicName, content, agentName);
}

function readTopic(runId: string, topicName: string): string | null {
  const db = getDb();
  ensureTopicsTable();
  const row = db
    .prepare(
      "SELECT content FROM agent_topics WHERE run_id = ? AND topic_name = ?",
    )
    .get(runId, topicName) as { content: string } | undefined;
  return row?.content ?? null;
}

// ── MCP Server ────────────────────────────────────────────────────────────────

function makeHandler(_request: Request) {
  return createMcpHandler(
    (server) => {
      // ── Tool 1: Researcher Agent (topic-aware) ────────────────────────────
      // Accepts a runId and writeTopic name. Queries the database, writes
      // output to the specified topic, and returns the topicId.
      server.registerTool(
        "researcher_agent",
        {
          title: "Researcher Agent (Topic)",
          description:
            "Queries the business database via MCP to gather data insights on a given topic. Writes the research report to a database topic identified by runId and writeTopic. Returns the topicId — the Orchestrator does NOT need to pass the full research text to the next agent.",
          inputSchema: {
            topic: z.string().describe("The research topic or question to investigate"),
            runId: z.string().describe("Unique run identifier — used as the topic key in the database"),
            writeTopic: z.string().describe("The topic name to write the research output to (e.g. \"research\")"),
          },
        },
        async ({ topic, runId, writeTopic: writeTopicName }: { topic: string; runId: string; writeTopic: string }) => {
          const mcpClient = await createMCPClient({
            transport: {
              type: "http",
              url: "http://localhost:3000/api/mcp/database/mcp",
            },
          });
          const dbTools = await mcpClient.tools();

          const result = await generateText({
            model: openai(DEFAULT_MODEL),
            system: RESEARCHER_SYSTEM_PROMPT,
            prompt: researcherUserPrompt(topic),
            stopWhen: stepCountIs(10),
            tools: dbTools,
            onFinish: async () => {
              await mcpClient.close();
            },
          });

          // ✅ Write to topic — the Orchestrator never sees this content
          writeTopic(runId, writeTopicName, result.text, "researcher_agent");

          const topicId = `${writeTopicName}:${runId}`;
          return {
            content: [
              {
                type: "text" as const,
                text: `Research complete. Output written to topic "${topicId}" (${result.text.length} chars). Pass runId="${runId}" to writer_agent — it will read the research directly from the database.`,
              },
            ],
          };
        },
      );

      // ── Tool 2: Writer Agent (topic-aware) ───────────────────────────────
      // Reads the research from the readTopic, writes the draft to writeTopic.
      server.registerTool(
        "writer_agent",
        {
          title: "Writer Agent (Topic)",
          description:
            "Reads the research report from the database topic (using runId and readTopic), writes an engaging blog post draft, and saves it to writeTopic. The Orchestrator does NOT need to pass the research text — only the runId and topic names.",
          inputSchema: {
            topic: z.string().describe("The blog post topic"),
            runId: z.string().describe("The run identifier — used to read and write topics in the database"),
            readTopic: z.string().describe("The topic name to read the research from (e.g. \"research\")"),
            writeTopic: z.string().describe("The topic name to write the draft to (e.g. \"draft\")"),
          },
        },
        async ({ topic, runId, readTopic: readTopicName, writeTopic: writeTopicName }: { topic: string; runId: string; readTopic: string; writeTopic: string }) => {
          // ✅ Read from topic — no large string passed from Orchestrator
          const research = readTopic(runId, readTopicName);
          if (!research) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Topic "${readTopicName}" for runId="${runId}" is empty. Make sure researcher_agent has completed first.`,
                },
              ],
              isError: true,
            };
          }

          const result = await generateText({
            model: openai(DEFAULT_MODEL),
            system: WRITER_SYSTEM_PROMPT,
            prompt: writerUserPrompt(topic, research),
          });

          // ✅ Write draft to topic
          writeTopic(runId, writeTopicName, result.text, "writer_agent");

          const topicId = `${writeTopicName}:${runId}`;
          return {
            content: [
              {
                type: "text" as const,
                text: `Draft complete. Output written to topic "${topicId}" (${result.text.length} chars). Pass runId="${runId}" to editor_agent — it will read the draft directly from the database.`,
              },
            ],
          };
        },
      );

      // ── Tool 3: Editor Agent (topic-aware) ───────────────────────────────
      // Reads the draft from readTopic. Writes the final article to writeTopic.
      server.registerTool(
        "editor_agent",
        {
          title: "Editor Agent (Topic)",
          description:
            "Reads the article draft from the database topic (using runId and readTopic), reviews and improves it, and saves the final version to writeTopic. The Orchestrator does NOT need to pass the draft text — only the runId and topic names.",
          inputSchema: {
            runId: z.string().describe("The run identifier — used to read and write topics in the database"),
            readTopic: z.string().describe("The topic name to read the draft from (e.g. \"draft\")"),
            writeTopic: z.string().describe("The topic name to write the final article to (e.g. \"final\")"),
          },
        },
        async ({ runId, readTopic: readTopicName, writeTopic: writeTopicName }: { runId: string; readTopic: string; writeTopic: string }) => {
          // ✅ Read from topic — no large string passed from Orchestrator
          const draft = readTopic(runId, readTopicName);
          if (!draft) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Error: Topic "${readTopicName}" for runId="${runId}" is empty. Make sure writer_agent has completed first.`,
                },
              ],
              isError: true,
            };
          }

          const result = await generateText({
            model: openai(DEFAULT_MODEL),
            system: EDITOR_SYSTEM_PROMPT,
            prompt: editorUserPrompt(draft),
          });

          // ✅ Write final article to topic
          writeTopic(runId, writeTopicName, result.text, "editor_agent");

          const topicId = `${writeTopicName}:${runId}`;
          return {
            content: [
              {
                type: "text" as const,
                text: `Editing complete. Final article written to topic "${topicId}" (${result.text.length} chars). The full pipeline is done — all outputs are persisted in the agent_topics table.`,
              },
            ],
          };
        },
      );
    },
    {},
    {
      basePath: "/api/mcp/agents-topic",
      maxDuration: 120,
      verboseLogs: true,
    },
  );
}

export async function GET(request: Request) {
  return makeHandler(request)(request);
}

export async function POST(request: Request) {
  return makeHandler(request)(request);
}
