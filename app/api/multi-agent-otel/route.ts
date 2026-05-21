import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { trace, SpanStatusCode, propagation, context } from "@opentelemetry/api";
import { getDb } from "@/lib/db";
import { initChatSession, saveAssistantMessage } from "@/lib/chat-session";
import { DEFAULT_MODEL } from "@/lib/config";
import { orchestratorSystemPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

// ─── Orchestrator Agent (with OpenTelemetry) ──────────────────────────────────
//
// Chapter 2: Observability with OpenTelemetry
//
// This is the Chapter 2 version of /api/multi-agent/route.ts.
// It adds OpenTelemetry tracing to the Orchestrator Agent:
//
//   1. A custom "orchestrator.handleRequest" span wraps the entire request,
//      recording session.id, prompt.length, and response.length.
//
//   2. A child "orchestrator.connectAgentMCP" span measures the MCP connection.
//
//   3. experimental_telemetry on streamText emits AI SDK spans automatically
//      (ai.streamText, ai.streamText.doStream, ai.toolCall per agent call).
//
//   4. Manual context propagation: the current OTel trace context is serialized
//      into HTTP headers and forwarded to the Agent MCP server via the transport
//      headers option. This ensures agent spans are children of this span rather
//      than orphaned root spans.
//
// Architecture:
//   Client → POST /api/multi-agent-otel
//              ↓
//         Orchestrator Agent (gpt + agent MCP tools from /api/mcp/agents-otel/mcp)
//              ↓ calls researcher_agent tool
//              ↓ calls writer_agent tool (with researcher output)
//              ↓ calls editor_agent tool (with writer output)
//              ↓ synthesizes final response
// ─────────────────────────────────────────────────────────────────────────────

const tracer = trace.getTracer("advanced-ai-tutorial");

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, sessionId } = body;

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "sessionId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return tracer.startActiveSpan("orchestrator.handleRequest", async (requestSpan) => {
    requestSpan.setAttribute("session.id", sessionId);
    requestSpan.setAttribute("prompt.length", prompt?.length ?? 0);

    try {
      const db = getDb();
      const messages = initChatSession(db, sessionId, prompt);

      // Serialize the current OTel context into HTTP headers so the agent MCP
      // server can restore the parent span and attach its spans to this trace.
      // The Web fetch API (used by HttpMCPTransport) does not auto-inject
      // traceparent, so we must do it manually here.
      const traceCarrier: Record<string, string> = {};
      propagation.inject(context.active(), traceCarrier);

      // Connect to the OTel-instrumented Agent MCP server
      const agentMcpClient = await tracer.startActiveSpan(
        "orchestrator.connectAgentMCP",
        async (mcpSpan) => {
          try {
            const client = await createMCPClient({
              transport: {
                type: "http",
                url: "http://localhost:3000/api/mcp/agents-otel/mcp",
                // Propagate the current trace context so agent spans are
                // attached to this trace rather than starting orphaned traces.
                headers: traceCarrier,
              },
            });
            return client;
          } finally {
            mcpSpan.end();
          }
        },
      );

      const agentTools = await agentMcpClient.tools();

      // Record how many agent tools are available
      requestSpan.setAttribute("agent.tools.count", Object.keys(agentTools).length);
      requestSpan.setAttribute(
        "agent.tools.names",
        Object.keys(agentTools).join(", "),
      );

      // Build a tool summary for the system prompt
      const toolSummary = Object.entries(agentTools)
        .map(([name, tool]) => `- **${name}**: ${tool.description ?? ""}`)
        .join("\n");

      const result = streamText({
        model: openai(DEFAULT_MODEL),
        experimental_telemetry: {
          isEnabled: true,
          functionId: "orchestrator-agent",   // shown as resource.name in Jaeger
          metadata: { sessionId },            // custom attributes on the span
        },
        system: orchestratorSystemPrompt(toolSummary),
        messages,
        stopWhen: stepCountIs(20),
        tools: agentTools,
        onFinish: async ({ text }) => {
          await agentMcpClient.close();
          saveAssistantMessage(db, sessionId, text);
          requestSpan.setAttribute("response.length", text.length);
          requestSpan.setStatus({ code: SpanStatusCode.OK });
          requestSpan.end();
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (err) {
      requestSpan.recordException(err as Error);
      requestSpan.setStatus({ code: SpanStatusCode.ERROR });
      requestSpan.end();
      throw err;
    }
  });
}
