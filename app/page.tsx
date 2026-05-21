"use client";

import { useState } from "react";
import MultiAgentCrew from "@/app/components/MultiAgentCrew";
import MultiAgentCrewOtel from "@/app/components/MultiAgentCrewOtel";
import DatabaseView from "@/app/components/DatabaseView";
import EvalsRunner from "@/app/components/EvalsRunner";
import TopicPipeline from "@/app/components/TopicPipeline";

type Tab = "multi-agent" | "multi-agent-otel" | "database" | "evals" | "topics";

export default function Home() {
  const [tab, setTab] = useState<Tab>("multi-agent");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 font-sans">
      {/* Page Header */}
      <header className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            🧠 Advanced AI Agent Tutorial
          </h1>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-0">
            <button
              onClick={() => setTab("database")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "database"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              🗄️ View Database
            </button>
            <button
              onClick={() => setTab("multi-agent")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "multi-agent"
                  ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              🤝 Multi-Agent Crew
            </button>
            <button
              onClick={() => setTab("multi-agent-otel")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "multi-agent-otel"
                  ? "border-orange-500 text-orange-600 dark:text-orange-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              🔭 OTel Tracing
            </button>
            <button
              onClick={() => setTab("evals")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "evals"
                  ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              🧪 Evals
            </button>
            <button
              onClick={() => setTab("topics")}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "topics"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
              }`}
            >
              📡 Agent Topics
            </button>
          </div>
        </div>
      </nav>

      {/* Tab Content */}
      <div className={tab === "multi-agent" ? undefined : "hidden"}>
        <MultiAgentCrew />
      </div>
      <div className={tab === "multi-agent-otel" ? undefined : "hidden"}>
        <MultiAgentCrewOtel />
      </div>
      <div className={tab === "database" ? undefined : "hidden"}>
        <DatabaseView />
      </div>
      <div className={tab === "topics" ? undefined : "hidden"}>
        <TopicPipeline />
      </div>
      <div className={tab === "evals" ? undefined : "hidden"}>
        <EvalsRunner />
      </div>
    </div>
  );
}
