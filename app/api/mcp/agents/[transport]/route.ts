import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
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

// ─── Agent MCP Server ─────────────────────────────────────────────────────────
// This MCP server exposes the 3 specialist agents as tools.
// The Orchestrator Agent calls these tools to delegate work.
// ─────────────────────────────────────────────────────────────────────────────

function makeHandler(_request: Request) {
  return createMcpHandler(
    (server) => {
      // ── Tool 1: Researcher Agent ────────────────────────────────────────
      server.registerTool(
        "researcher_agent",
        {
          title: "Researcher Agent",
          description:
            "Queries the business database (inventory, customers, sales tables) via MCP to gather data insights on a given topic. Returns a structured research report with specific numbers and facts.",
          inputSchema: {
            topic: z.string().describe("The research topic or question to investigate"),
          },
        },
        async ({ topic }: { topic: string }) => {
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

          return {
            content: [{ type: "text" as const, text: result.text }],
          };
        },
      );

      // ── Tool 2: Writer Agent ────────────────────────────────────────────
      server.registerTool(
        "writer_agent",
        {
          title: "Writer Agent",
          description:
            "Writes an engaging, data-driven blog post draft based on a topic and research notes. Returns a complete article draft in markdown format.",
          inputSchema: {
            topic: z.string().describe("The blog post topic"),
            research: z.string().describe("Research notes and data points to incorporate"),
          },
        },
        async ({ topic, research }: { topic: string; research: string }) => {
          const result = await generateText({
            model: openai(DEFAULT_MODEL),
            system: WRITER_SYSTEM_PROMPT,
            prompt: writerUserPrompt(topic, research),
          });

          return {
            content: [{ type: "text" as const, text: result.text }],
          };
        },
      );

      // ── Tool 3: Editor Agent ────────────────────────────────────────────
      server.registerTool(
        "editor_agent",
        {
          title: "Editor Agent",
          description:
            "Reviews and improves a blog article draft for clarity, SEO, and brand voice. Returns editorial feedback plus an improved final version of the article.",
          inputSchema: {
            article: z.string().describe("The article draft to review and improve"),
          },
        },
        async ({ article }: { article: string }) => {
          const result = await generateText({
            model: openai(DEFAULT_MODEL),
            system: EDITOR_SYSTEM_PROMPT,
            prompt: editorUserPrompt(article),
          });

          return {
            content: [{ type: "text" as const, text: result.text }],
          };
        },
      );
    },
    {},
    {
      basePath: "/api/mcp/agents",
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
