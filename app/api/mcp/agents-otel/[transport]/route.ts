import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { trace, SpanStatusCode, propagation, context } from "@opentelemetry/api";
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

// ─── Agent MCP Server (with OpenTelemetry) ────────────────────────────────────
//
// Chapter 2: Observability with OpenTelemetry
//
// This is the Chapter 2 version of /api/mcp/agents/[transport]/route.ts.
// It adds OpenTelemetry tracing to each specialist agent tool:
//
//   1. Each agent tool handler is wrapped in a custom span
//      (researcher_agent.run, writer_agent.run, editor_agent.run).
//
//   2. The researcher also gets a child span for its MCP connection
//      (researcher_agent.connectDatabaseMCP).
//
//   3. experimental_telemetry on generateText emits AI SDK spans automatically
//      (ai.generateText, ai.generateText.doGenerate, ai.toolCall).
//
//   4. Manual context propagation: the Orchestrator injects the traceparent
//      header into the MCP transport. This file extracts it from the incoming
//      request and restores the parent context so all agent spans are children
//      of the Orchestrator's span — producing one unified trace in Jaeger.
//
// ─────────────────────────────────────────────────────────────────────────────

const tracer = trace.getTracer("advanced-ai-tutorial");

function makeHandler(request: Request) {
  // Extract the OTel trace context that the Orchestrator injected into the
  // MCP transport headers (traceparent / tracestate). Without this, the Web
  // fetch API used by HttpMCPTransport never forwards those headers
  // automatically, so every agent would start an orphaned root span.
  const carrier: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    carrier[key] = value;
  });
  const parentContext = propagation.extract(context.active(), carrier);

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
          // Run inside the parent context so this span is a child of the
          // orchestrator's active span rather than a new root span.
          return context.with(parentContext, () =>
            tracer.startActiveSpan("researcher_agent.run", async (agentSpan) => {
              agentSpan.setAttribute("research.topic", topic);

              try {
                const mcpClient = await tracer.startActiveSpan(
                  "researcher_agent.connectDatabaseMCP",
                  async (mcpSpan) => {
                    try {
                      return await createMCPClient({
                        transport: {
                          type: "http",
                          url: "http://localhost:3000/api/mcp/database/mcp",
                        },
                      });
                    } finally {
                      mcpSpan.end();
                    }
                  },
                );

                const dbTools = await mcpClient.tools();
                agentSpan.setAttribute("db.tools.count", Object.keys(dbTools).length);

                const result = await generateText({
                  model: openai(DEFAULT_MODEL),
                  experimental_telemetry: {
                    isEnabled: true,
                    functionId: "researcher-agent",
                    metadata: { topic },
                  },
                  system: RESEARCHER_SYSTEM_PROMPT,
                  prompt: researcherUserPrompt(topic),
                  stopWhen: stepCountIs(10),
                  tools: dbTools,
                  onFinish: async () => {
                    await mcpClient.close();
                  },
                });

                agentSpan.setAttribute("research.output.length", result.text.length);
                agentSpan.setStatus({ code: SpanStatusCode.OK });

                return {
                  content: [{ type: "text" as const, text: result.text }],
                };
              } catch (err) {
                agentSpan.recordException(err as Error);
                agentSpan.setStatus({ code: SpanStatusCode.ERROR });
                throw err;
              } finally {
                agentSpan.end();
              }
            }),
          );
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
          return context.with(parentContext, () =>
            tracer.startActiveSpan("writer_agent.run", async (agentSpan) => {
              agentSpan.setAttribute("article.topic", topic);
              agentSpan.setAttribute("research.input.length", research.length);

              try {
                const result = await generateText({
                  model: openai(DEFAULT_MODEL),
                  experimental_telemetry: {
                    isEnabled: true,
                    functionId: "writer-agent",
                    metadata: { topic },
                  },
                  system: WRITER_SYSTEM_PROMPT,
                  prompt: writerUserPrompt(topic, research),
                });

                agentSpan.setAttribute("article.output.length", result.text.length);
                agentSpan.setStatus({ code: SpanStatusCode.OK });

                return {
                  content: [{ type: "text" as const, text: result.text }],
                };
              } catch (err) {
                agentSpan.recordException(err as Error);
                agentSpan.setStatus({ code: SpanStatusCode.ERROR });
                throw err;
              } finally {
                agentSpan.end();
              }
            }),
          );
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
          return context.with(parentContext, () =>
            tracer.startActiveSpan("editor_agent.run", async (agentSpan) => {
              agentSpan.setAttribute("article.input.length", article.length);

              try {
                const result = await generateText({
                  model: openai(DEFAULT_MODEL),
                  experimental_telemetry: {
                    isEnabled: true,
                    functionId: "editor-agent",
                  },
                  system: EDITOR_SYSTEM_PROMPT,
                  prompt: editorUserPrompt(article),
                });

                agentSpan.setAttribute("article.output.length", result.text.length);
                agentSpan.setStatus({ code: SpanStatusCode.OK });

                return {
                  content: [{ type: "text" as const, text: result.text }],
                };
              } catch (err) {
                agentSpan.recordException(err as Error);
                agentSpan.setStatus({ code: SpanStatusCode.ERROR });
                throw err;
              } finally {
                agentSpan.end();
              }
            }),
          );
        },
      );
    },
    {},
    {
      basePath: "/api/mcp/agents-otel",
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
