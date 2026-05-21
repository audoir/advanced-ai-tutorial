import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { getDb } from "@/lib/db";
import { initChatSession, saveAssistantMessage } from "@/lib/chat-session";
import { DEFAULT_MODEL } from "@/lib/config";
import { orchestratorSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

// ─── Orchestrator Agent ───────────────────────────────────────────────────────
//
// A single "Orchestrator Agent" that has 3 specialist agents available
// as MCP tools. The orchestrator decides:
//   - Which agents to call
//   - In what order
//   - What to pass from one agent's output to the next
//
// The specialist agents are served from /api/mcp/agents/mcp:
//   - researcher_agent: queries the database via MCP for real data
//   - writer_agent:     drafts a blog post from research
//   - editor_agent:     reviews and polishes the draft
//
// Architecture:
//   Client → POST /api/multi-agent
//              ↓
//         Orchestrator Agent (gpt + agent MCP tools)
//              ↓ calls researcher_agent tool
//              ↓ calls writer_agent tool (with researcher output)
//              ↓ calls editor_agent tool (with writer output)
//              ↓ synthesizes final response
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, sessionId } = body;

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const messages = initChatSession(db, sessionId, prompt);

  // Connect to the Agent MCP server — each tool IS a specialist agent
  const agentMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents/mcp",
    },
  });

  const agentTools = await agentMcpClient.tools();

  // Build a tool summary for the system prompt
  const toolSummary = Object.entries(agentTools)
    .map(([name, tool]) => `- **${name}**: ${tool.description ?? ""}`)
    .join("\n");

  const result = streamText({
    model: openai(DEFAULT_MODEL),
    system: orchestratorSystemPrompt(toolSummary),
    messages,
    stopWhen: stepCountIs(20),
    tools: agentTools,
    onFinish: async ({ text }) => {
      await agentMcpClient.close();
      saveAssistantMessage(db, sessionId, text);
    },
  });

  return result.toUIMessageStreamResponse();
}
