"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompletion } from "@ai-sdk/react";
import { useSession } from "@/app/components/chat/useSession";
import type { ChatMessage } from "@/app/components/chat/types";

// ─── Topic Pipeline UI ────────────────────────────────────────────────────────
//
// Chapter 4: Agent Topics
//
// Demonstrates the topic-based pipeline where each agent writes its output
// to a named topic in the database, and the next agent reads from that
// topic directly — instead of the orchestrator copy-pasting large strings
// between tool calls.
//
// Like Chapter 1, an Orchestrator Agent drives the pipeline via MCP tool calls.
// Unlike Chapter 1, the agents only pass a short runId between each other —
// all large content is persisted in the agent_topics SQLite table.
//
// The UI streams the Orchestrator's narration (like Chapter 1) and then polls
// the database to show the topic contents after the pipeline completes.
// ─────────────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  {
    key: "research" as const,
    emoji: "🔍",
    label: "Researcher Agent",
    description: "Queries the database via MCP → writes to topic",
    topicName: "research",
    borderColor: "border-blue-200 dark:border-blue-800",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    badgeColor: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
    headerColor: "text-blue-700 dark:text-blue-300",
  },
  {
    key: "draft" as const,
    emoji: "✍️",
    label: "Writer Agent",
    description: "Reads research topic → writes draft topic",
    topicName: "draft",
    borderColor: "border-emerald-200 dark:border-emerald-800",
    bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
    badgeColor: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
    headerColor: "text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "final" as const,
    emoji: "📝",
    label: "Editor Agent",
    description: "Reads draft topic → writes final topic",
    topicName: "final",
    borderColor: "border-purple-200 dark:border-purple-800",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    badgeColor: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
    headerColor: "text-purple-700 dark:text-purple-300",
  },
];

const SUGGESTIONS = [
  "Write a blog post about our best-selling electronics",
  "Create a report on customer purchasing trends",
  "Analyze our top revenue-generating products",
  "Write about our most loyal customers and what they buy",
];

type TopicKey = "research" | "draft" | "final";

interface TopicData {
  content: string;
  agentName: string;
  createdAt: string;
}

function TopicCard({
  stage,
  topicData,
  isComplete,
}: {
  stage: typeof PIPELINE_STAGES[number];
  topicData: TopicData | null;
  isComplete: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-xl border transition-all duration-300 ${
        isComplete
          ? stage.borderColor
          : "border-gray-200 dark:border-zinc-700 opacity-40"
      }`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-t-xl ${
          isComplete ? stage.bgColor : "bg-gray-50 dark:bg-zinc-800/50"
        }`}
      >
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
            isComplete
              ? stage.badgeColor
              : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-zinc-600"
          }`}
        >
          {stage.emoji}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${
                isComplete ? stage.headerColor : "text-gray-500 dark:text-zinc-500"
              }`}
            >
              {stage.label}
            </span>
            {isComplete && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.badgeColor}`}>
                ✓ written to topic
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">
            {isComplete ? (
              <>
                <span className="font-mono text-gray-700 dark:text-zinc-300">
                  topic:{stage.topicName}
                </span>
                {topicData && (
                  <span className="ml-2 text-gray-400 dark:text-zinc-600">
                    · {topicData.content.length.toLocaleString()} chars
                  </span>
                )}
              </>
            ) : (
              stage.description
            )}
          </p>
        </div>

        {isComplete && topicData && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {isComplete && topicData && expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-200 dark:border-zinc-700">
          <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">
            {topicData.content}
          </pre>
        </div>
      )}
    </div>
  );
}

function TopicArrow({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex flex-col items-center gap-0.5">
        <div className={`w-px h-3 ${active ? "bg-gray-400 dark:bg-zinc-500" : "bg-gray-200 dark:bg-zinc-700"}`} />
        <div className="flex items-center gap-1">
          <div className={`h-px w-6 ${active ? "bg-gray-300 dark:bg-zinc-600" : "bg-gray-100 dark:bg-zinc-800"}`} />
          <span className={`text-xs font-mono ${active ? "text-gray-500 dark:text-zinc-400" : "text-gray-300 dark:text-zinc-700"}`}>
            reads topic
          </span>
          <div className={`h-px w-6 ${active ? "bg-gray-300 dark:bg-zinc-600" : "bg-gray-100 dark:bg-zinc-800"}`} />
        </div>
        <svg
          className={`w-3 h-3 ${active ? "text-gray-400 dark:text-zinc-500" : "text-gray-200 dark:text-zinc-700"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        <div className={`w-px h-3 ${active ? "bg-gray-400 dark:bg-zinc-500" : "bg-gray-200 dark:bg-zinc-700"}`} />
      </div>
    </div>
  );
}

export default function TopicPipeline() {
  const { sessionId: runId, resetSession: resetRunId } = useSession();
  const [input, setInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [topicData, setTopicData] = useState<Partial<Record<TopicKey, TopicData>>>({});
  const [orchestratorLog, setOrchestratorLog] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { completion, complete, isLoading, error } = useCompletion({
    api: "/api/topic-pipeline",
    onFinish: (_prompt, completion) => {
      setOrchestratorLog(completion);
      setChatHistory((prev) => [...prev, { role: "assistant", content: completion }]);
    },
  });

  // Poll the database for topic contents while the pipeline is running,
  // and do one final fetch after it completes.
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTopics = useCallback((id: string) => {
    fetch(`/api/topic-pipeline?runId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data: { runId: string; topics: Record<string, TopicData> }) => {
        const mapped: Partial<Record<TopicKey, TopicData>> = {};
        for (const [key, val] of Object.entries(data.topics)) {
          mapped[key as TopicKey] = val;
        }
        setTopicData(mapped);
      })
      .catch(() => {/* non-fatal */});
  }, []);

  // Start polling when a run begins, stop when it finishes
  useEffect(() => {
    if (isLoading && runId) {
      // Poll every 2 seconds while the pipeline is running
      pollingRef.current = setInterval(() => fetchTopics(runId), 2000);
    } else {
      // Stop polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      // Do one final fetch after the run completes
      if (runId && orchestratorLog) {
        fetchTopics(runId);
      }
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isLoading, runId, orchestratorLog, fetchTopics]);

  // Focus textarea after loading
  useEffect(() => {
    if (!isLoading) textareaRef.current?.focus();
  }, [isLoading]);

  // Scroll to bottom on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, completion, isLoading, topicData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const userTopic = input.trim();
    if (!userTopic || isLoading || !runId) return;

    setTopicData({});
    setOrchestratorLog(null);
    setChatHistory((prev) => [...prev, { role: "user", content: userTopic }]);
    setInput("");

    await complete(userTopic, { body: { runId } });
  }, [input, isLoading, complete, runId]);

  const handleReset = useCallback(() => {
    setChatHistory([]);
    setTopicData({});
    setOrchestratorLog(null);
    setInput("");
    resetRunId();
    textareaRef.current?.focus();
  }, [resetRunId]);

  const hasStarted = chatHistory.length > 0 || isLoading;
  const completedTopics = Object.keys(topicData) as TopicKey[];

  return (
    <div className="flex flex-col h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 via-emerald-500 to-purple-500 flex items-center justify-center text-white text-sm">
              📡
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Orchestrator + Agent Topics
              </h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Agents communicate via database topics — no copy-paste in the Orchestrator context
              </p>
            </div>
          </div>
          {hasStarted && (
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
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-zinc-900 px-4 py-6">
        <div className="max-w-4xl mx-auto">

          {/* Empty state */}
          {!hasStarted && (
            <div className="text-center py-8">
              {/* Architecture comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 max-w-2xl mx-auto text-left">
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-4">
                  <div className="text-sm font-semibold text-red-700 dark:text-red-400 mb-3">
                    ❌ Chapter 1 (context bloat)
                  </div>
                  <div className="font-mono text-xs text-gray-600 dark:text-zinc-400 space-y-1">
                    <div>researcher_agent(subject)</div>
                    <div className="pl-2 text-red-500">→ returns 2,000 chars</div>
                    <div>writer_agent(subject,</div>
                    <div className="pl-2 text-red-500 font-bold">  &quot;[2,000 chars pasted]&quot;)</div>
                    <div>editor_agent(</div>
                    <div className="pl-2 text-red-500 font-bold">  &quot;[3,000 chars pasted]&quot;)</div>
                  </div>
                </div>
                <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-4">
                  <div className="text-sm font-semibold text-green-700 dark:text-green-400 mb-3">
                    ✅ Chapter 4 (agent topics)
                  </div>
                  <div className="font-mono text-xs text-gray-600 dark:text-zinc-400 space-y-1">
                    <div>researcher_agent(subject, runId)</div>
                    <div className="pl-2 text-green-600">→ publishes to &quot;research&quot;</div>
                    <div>writer_agent(subject, runId)</div>
                    <div className="pl-2 text-green-600">→ subscribes / publishes</div>
                    <div>editor_agent(runId)</div>
                    <div className="pl-2 text-green-600">→ subscribes / publishes</div>
                  </div>
                </div>
              </div>

              {/* Architecture diagram */}
              <div className="flex items-center justify-center gap-1 mb-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-2xl shadow-md">🤖</div>
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Orchestrator</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">passes runId only</span>
                </div>
                <div className="flex flex-col gap-3 mx-2">
                  {PIPELINE_STAGES.map((stage) => (
                    <div key={stage.key} className="flex items-center gap-1">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      <div className={`w-8 h-8 rounded-full ${stage.badgeColor} flex items-center justify-center text-sm shadow`}>
                        {stage.emoji}
                      </div>
                      <span className={`text-xs font-medium ${stage.headerColor}`}>{stage.label}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col items-center gap-1 ml-2">
                  <div className="text-xs font-mono text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded px-2 py-1">topic:research</div>
                  <div className="text-xs font-mono text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded px-2 py-1">topic:draft</div>
                  <div className="text-xs font-mono text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded px-2 py-1">topic:final</div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Two-column layout: Chat history + Topic stages */}
          {hasStarted && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Chat history */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  🤖 Orchestrator Agent
                </h3>
                <div className="flex flex-col gap-3">
                  {/* Completed turns */}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
                          🤖
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700 rounded-bl-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
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
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
                        🤖
                      </div>
                      <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700">
                        {completion ? (
                          <p className="whitespace-pre-wrap text-xs">
                            {completion}
                            <span className="inline-block w-2 h-3 ml-1 bg-indigo-500 animate-pulse align-middle rounded-sm" />
                          </p>
                        ) : (
                          <div className="flex gap-1 items-center py-1">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Topic stages */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
                  📡 Database Topics
                </h3>
                <div className="space-y-0">
                  {PIPELINE_STAGES.map((stage, i) => {
                    const isComplete = stage.key in topicData;
                    return (
                      <div key={stage.key}>
                        <TopicCard
                          stage={stage}
                          topicData={topicData[stage.key] ?? null}
                          isComplete={isComplete}
                        />
                        {i < PIPELINE_STAGES.length - 1 && (
                          <TopicArrow active={isComplete} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* DB info */}
                {completedTopics.length > 0 && runId && (
                  <div className="mt-3 p-3 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                    <p className="text-xs text-gray-400 dark:text-zinc-600">
                      <span className="font-mono">SELECT * FROM agent_topics</span>
                      <br />
                      <span className="font-mono">WHERE run_id = &apos;{runId.slice(0, 20)}…&apos;</span>
                    </p>
                    <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
                      {completedTopics.length}/3 topics written
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm">
              <span className="font-semibold">Error:</span> {error.message || String(error)}
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
              placeholder="Give the pipeline a topic… e.g. 'Write a blog post about our best-selling products'"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 max-h-32 overflow-y-auto"
              style={{ minHeight: "48px" }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            Orchestrator at /api/topic-pipeline · Topic agents at /api/mcp/agents-topic · Topics in{" "}
            <span className="font-mono">agent_topics</span> table
          </p>
        </div>
      </div>
    </div>
  );
}
