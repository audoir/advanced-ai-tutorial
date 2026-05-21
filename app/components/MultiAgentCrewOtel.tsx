"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompletion } from "@ai-sdk/react";
import { useSession } from "@/app/components/chat/useSession";
import type { ChatMessage } from "@/app/components/chat/types";

// ─── Multi-Agent Crew UI (with OpenTelemetry) ─────────────────────────────────
//
// Chapter 2: Observability with OpenTelemetry
//
// This is the Chapter 2 version of MultiAgentCrew.tsx. It is identical in
// appearance and behavior, but hits /api/multi-agent-otel instead of
// /api/multi-agent. That route instruments every LLM call with OpenTelemetry
// spans and forwards trace context to the agent MCP server at
// /api/mcp/agents-otel, producing a single unified trace in Jaeger.
//
// To see the traces:
//   1. Start Jaeger: docker run --rm --name jaeger \
//        -p 16686:16686 -p 4317:4317 -p 4318:4318 \
//        cr.jaegertracing.io/jaegertracing/jaeger:2.18.0
//   2. Send a prompt from this tab
//   3. Open http://localhost:16686 → Service: advanced-ai-tutorial
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_STEPS = [
  { emoji: "🔍", name: "Researcher Agent", color: "bg-blue-600", text: "text-blue-700 dark:text-blue-300" },
  { emoji: "✍️", name: "Writer Agent", color: "bg-emerald-600", text: "text-emerald-700 dark:text-emerald-300" },
  { emoji: "📝", name: "Editor Agent", color: "bg-purple-600", text: "text-purple-700 dark:text-purple-300" },
];

const SUGGESTIONS = [
  "Write a blog post about our best-selling electronics",
  "Create a report on customer purchasing trends",
  "Analyze our top revenue-generating products",
  "Write about our most loyal customers and what they buy",
];

export default function MultiAgentCrewOtel() {
  const { sessionId, resetSession } = useSession();
  const [input, setInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Key difference from Chapter 1: hits /api/multi-agent-otel ──────────────
  const { completion, complete, isLoading, error } = useCompletion({
    api: "/api/multi-agent-otel",
    body: { sessionId },
    onFinish: (_prompt, completion) => {
      setChatHistory((prev) => [...prev, { role: "assistant", content: completion }]);
    },
  });

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, completion, isLoading]);

  // Focus textarea after loading
  useEffect(() => {
    if (!isLoading) textareaRef.current?.focus();
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = input.trim();
    if (!topic || isLoading || !sessionId) return;
    setInput("");
    setChatHistory((prev) => [...prev, { role: "user", content: topic }]);
    await complete(topic);
  };

  const handleReset = useCallback(() => {
    setChatHistory([]);
    setInput("");
    resetSession();
  }, [resetSession]);

  if (!sessionId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-130px)]">
        <div className="text-gray-500 dark:text-zinc-400 text-sm">Initializing session…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 flex items-center justify-center text-white text-sm">
              🔭
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Orchestrator Agent + Marketing Crew (OTel)
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Session: <span className="font-mono">{sessionId.slice(0, 20)}…</span>
                {" · "}
                <span className="text-orange-600 dark:text-orange-400 font-medium">
                  Traces → Jaeger at localhost:16686
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
            </svg>
            Reset
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-zinc-900 px-4 py-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">

          {/* Empty state */}
          {chatHistory.length === 0 && !isLoading && (
            <div className="text-center py-12">
              {/* OTel callout */}
              <div className="mb-6 mx-auto max-w-lg rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10 p-4 text-left">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">🔭</span>
                  <div>
                    <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-1">
                      OpenTelemetry tracing enabled
                    </p>
                    <p className="text-xs text-orange-700 dark:text-orange-400 mb-2">
                      Every LLM call is instrumented with OTel spans. Start Jaeger to see the full trace waterfall:
                    </p>
                    <pre className="text-xs bg-orange-100 dark:bg-orange-900/30 rounded p-2 font-mono text-orange-800 dark:text-orange-300 overflow-x-auto whitespace-pre-wrap">
{`docker run --rm --name jaeger \\
  -p 16686:16686 -p 4318:4318 \\
  cr.jaegertracing.io/jaegertracing/jaeger:2.18.0`}
                    </pre>
                    <p className="text-xs text-orange-600 dark:text-orange-500 mt-2">
                      Then open{" "}
                      <a
                        href="http://localhost:16686"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-orange-800 dark:hover:text-orange-300"
                      >
                        http://localhost:16686
                      </a>
                    </p>
                  </div>
                </div>
              </div>

              {/* Architecture diagram */}
              <div className="flex items-center justify-center gap-1 mb-8">
                {/* Orchestrator */}
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-orange-500 flex items-center justify-center text-2xl shadow-md">🤖</div>
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300">Orchestrator Agent</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">+ OTel spans</span>
                </div>
                {/* Arrow out */}
                <div className="flex flex-col gap-3 mx-2">
                  {AGENT_STEPS.map((agent) => (
                    <div key={agent.name} className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <div className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center text-sm shadow`}>
                        {agent.emoji}
                      </div>
                      <span className={`text-xs font-medium ${agent.text}`}>{agent.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              <h3 className="text-lg font-semibold text-gray-700 dark:text-zinc-300 mb-2">
                Orchestrator Agent + Marketing Crew (OTel)
              </h3>
              <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-lg mx-auto mb-3">
                Same pipeline as Chapter 1, but every{" "}
                <span className="font-mono text-xs bg-gray-100 dark:bg-zinc-800 px-1 rounded">generateText</span> and{" "}
                <span className="font-mono text-xs bg-gray-100 dark:bg-zinc-800 px-1 rounded">streamText</span> call
                emits OTel spans. Manual context propagation links all agent spans into one unified trace.
              </p>
              <div className="text-xs text-gray-400 dark:text-zinc-600 font-mono bg-gray-100 dark:bg-zinc-800 rounded-lg p-3 max-w-sm mx-auto text-left mb-6">
                <div>orchestrator.handleRequest</div>
                <div className="pl-2">└─ orchestrator.connectAgentMCP</div>
                <div className="pl-2">└─ ai.streamText [orchestrator-agent]</div>
                <div className="pl-4">└─ researcher_agent.run</div>
                <div className="pl-6">└─ ai.generateText [researcher-agent]</div>
                <div className="pl-4">└─ writer_agent.run</div>
                <div className="pl-4">└─ editor_agent.run</div>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat history */}
          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
                  🤖
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700 rounded-bl-sm"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center text-gray-700 dark:text-zinc-300 text-xs ml-2 mt-1 flex-shrink-0">
                  U
                </div>
              )}
            </div>
          ))}

          {/* Streaming response */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
                🤖
              </div>
              <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700">
                {completion ? (
                  <p className="whitespace-pre-wrap">
                    {completion}
                    <span className="inline-block w-2 h-4 ml-1 bg-orange-500 animate-pulse align-middle rounded-sm" />
                  </p>
                ) : (
                  <div className="flex gap-1 items-center py-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm">
              Error: {error.message || String(error)}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Give the crew a topic… e.g. 'Write a blog post about our best-selling products'"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 max-h-32 overflow-y-auto"
              style={{ minHeight: "48px" }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                </svg>
              )}
            </button>
          </form>
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-2 text-center">
            Orchestrator at /api/multi-agent-otel · OTel agents at /api/mcp/agents-otel · Traces → Jaeger at localhost:16686
          </p>
        </div>
      </div>
    </div>
  );
}
