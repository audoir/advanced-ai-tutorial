"use client";

import { useState } from "react";

// ─── Evals Runner UI ──────────────────────────────────────────────────────────
// Provides a browser-based interface for running the eval suite against the
// multi-agent system. Shows per-test results, check breakdowns, and aggregate
// metrics (accuracy, pass rate, per-suite breakdown).

type EvalSuite = "researcher" | "pipeline" | "safety";

interface TestCaseMeta {
  id: string;
  input: string;
  description: string;
  checkCount: number;
  metadata?: {
    suite: string;
    difficulty?: "easy" | "medium" | "hard";
    tags?: string[];
  };
}

interface LlmJudgeResult {
  passed: boolean;
  scores: {
    relevance: number;
    accuracy: number;
    coherence: number;
    completeness: number;
  };
  reasoning: string;
}

interface EvalResult {
  testCase: TestCaseMeta;
  output: string;
  passed: boolean;
  checkResults: boolean[];
  durationMs: number;
  error?: string;
  llmJudge?: LlmJudgeResult | null;
}

interface EvalMetrics {
  total: number;
  passed: number;
  failed: number;
  accuracy: number;
  avgDurationMs: number;
  bySuite: Record<string, { total: number; passed: number; accuracy: number }>;
}

interface EvalResponse {
  results: EvalResult[];
  metrics: EvalMetrics;
}

interface TestCaseListResponse {
  testCases: TestCaseMeta[];
  suites: Record<string, string[]>;
  total: number;
}

const SUITE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  researcher: { label: "Researcher", emoji: "🔍", color: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300" },
  pipeline:   { label: "Pipeline",   emoji: "🔄", color: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300" },
  safety:     { label: "Safety",     emoji: "🛡️", color: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300" },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300",
  medium: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300",
  hard:   "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
};

function AccuracyBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-gray-700 dark:text-zinc-300 w-10 text-right">
        {pct}%
      </span>
    </div>
  );
}

function LlmJudgeBadge({ result }: { result: LlmJudgeResult }) {
  const avg = Object.values(result.scores).reduce((a, b) => a + b, 0) / 4;
  return (
    <div className="mt-2 p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-indigo-700 dark:text-indigo-300">🤖 LLM Judge</span>
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${result.passed ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
          {result.passed ? "PASS" : "FAIL"}
        </span>
        <span className="text-indigo-500 dark:text-indigo-400 font-mono">avg {(avg * 100).toFixed(0)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mb-1">
        {Object.entries(result.scores).map(([dim, score]) => (
          <div key={dim} className="flex items-center justify-between">
            <span className="text-gray-500 dark:text-zinc-400 capitalize">{dim}</span>
            <span className="font-mono text-gray-700 dark:text-zinc-300">{(score * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      <p className="text-gray-600 dark:text-zinc-400 italic">{result.reasoning}</p>
    </div>
  );
}

function ResultCard({ result, index }: { result: EvalResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const suite = result.testCase.metadata?.suite ?? "unknown";
  const suiteInfo = SUITE_LABELS[suite] ?? { label: suite, emoji: "📋", color: "bg-gray-100 text-gray-700" };
  const difficulty = result.testCase.metadata?.difficulty;
  const llmJudgeFailed = result.llmJudge != null && !result.llmJudge.passed;
  const isFailed = !result.passed || llmJudgeFailed;

  return (
    <div className={`rounded-xl border transition-colors ${!isFailed ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10" : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"}`}>
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Pass/fail icon */}
        <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${!isFailed ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
          {!isFailed ? "✓" : "✗"}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-xs font-mono text-gray-500 dark:text-zinc-500">#{index + 1}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${suiteInfo.color}`}>
              {suiteInfo.emoji} {suiteInfo.label}
            </span>
            {difficulty && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[difficulty] ?? ""}`}>
                {difficulty}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono ml-auto">
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{result.testCase.input}</p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">{result.testCase.description}</p>

          {/* Check results */}
          <div className="flex gap-1 mt-2">
            {result.checkResults.map((ok, i) => (
              <span
                key={i}
                title={`Check ${i + 1}: ${ok ? "passed" : "failed"}`}
                className={`w-4 h-4 rounded-sm text-xs flex items-center justify-center font-bold ${ok ? "bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300" : "bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300"}`}
              >
                {ok ? "✓" : "✗"}
              </span>
            ))}
            <span className="text-xs text-gray-400 dark:text-zinc-500 ml-1">
              {result.checkResults.filter(Boolean).length}/{result.checkResults.length} checks
            </span>
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-zinc-700 pt-3">
          {result.error && (
            <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              <span className="font-semibold">Error:</span> {result.error}
            </div>
          )}
          {result.output && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-1">
                Agent Output
              </p>
              <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                {result.output}
              </pre>
            </div>
          )}
          {result.llmJudge && <LlmJudgeBadge result={result.llmJudge} />}
        </div>
      )}
    </div>
  );
}

function MetricsSummary({ metrics }: { metrics: EvalMetrics }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-4">📊 Results Summary</h3>

      {/* Overall stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        {[
          { label: "Total", value: metrics.total, color: "text-gray-900 dark:text-white" },
          { label: "Passed", value: metrics.passed, color: "text-green-600 dark:text-green-400" },
          { label: "Failed", value: metrics.failed, color: "text-red-600 dark:text-red-400" },
          { label: "Avg Time", value: `${(metrics.avgDurationMs / 1000).toFixed(1)}s`, color: "text-blue-600 dark:text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-gray-500 dark:text-zinc-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Overall accuracy bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 dark:text-zinc-400 mb-1">
          <span>Overall Accuracy</span>
        </div>
        <AccuracyBar value={metrics.accuracy} />
      </div>

      {/* Per-suite breakdown */}
      {Object.keys(metrics.bySuite).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
            By Suite
          </p>
          <div className="space-y-2">
            {Object.entries(metrics.bySuite).map(([suite, stats]) => {
              const info = SUITE_LABELS[suite] ?? { label: suite, emoji: "📋" };
              return (
                <div key={suite}>
                  <div className="flex justify-between text-xs text-gray-600 dark:text-zinc-400 mb-1">
                    <span>{info.emoji} {info.label} ({stats.passed}/{stats.total})</span>
                  </div>
                  <AccuracyBar value={stats.accuracy} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EvalsRunner() {
  const [testCases, setTestCases] = useState<TestCaseMeta[] | null>(null);
  const [results, setResults] = useState<EvalResult[] | null>(null);
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSuite, setSelectedSuite] = useState<EvalSuite | "all">("all");
  const [useLlmJudge, setUseLlmJudge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingTestCases, setLoadingTestCases] = useState(false);

  // Load test case list (no LLM calls)
  async function loadTestCases() {
    setLoadingTestCases(true);
    setError(null);
    try {
      const res = await fetch("/api/evals");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TestCaseListResponse = await res.json();
      setTestCases(data.testCases);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTestCases(false);
    }
  }

  // Run the eval suite
  async function runEvals() {
    setIsRunning(true);
    setResults(null);
    setMetrics(null);
    setError(null);

    try {
      const body: Record<string, unknown> = { llmJudge: useLlmJudge };
      if (selectedSuite !== "all") body.suite = selectedSuite;

      const res = await fetch("/api/evals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data: EvalResponse = await res.json();
      setResults(data.results);
      setMetrics(data.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }

  const suiteOptions: { value: EvalSuite | "all"; label: string; emoji: string }[] = [
    { value: "all",        label: "All Suites",  emoji: "🧪" },
    { value: "researcher", label: "Researcher",  emoji: "🔍" },
    { value: "pipeline",   label: "Pipeline",    emoji: "🔄" },
    { value: "safety",     label: "Safety",      emoji: "🛡️" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          🧪 Eval Runner
        </h2>
        <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-2xl">
          Systematically test the multi-agent system against a curated dataset of{" "}
          <span className="font-medium text-gray-700 dark:text-zinc-300">12 test cases</span>{" "}
          across three suites: Researcher (data retrieval), Pipeline (end-to-end content generation),
          and Safety (refusal &amp; hallucination prevention).
        </p>
      </div>

      {/* Architecture explainer */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 mb-6">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3">How Evals Work</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          {[
            {
              title: "1. Dataset",
              icon: "📋",
              desc: "12 test cases with inputs and code-based checker functions. Each check is a pure function: (output: string) → boolean.",
              color: "border-blue-200 dark:border-blue-800",
            },
            {
              title: "2. Runner",
              icon: "⚙️",
              desc: "Feeds each input to the agent (researcher or full pipeline), collects the output, and measures latency.",
              color: "border-purple-200 dark:border-purple-800",
            },
            {
              title: "3. Scorer",
              icon: "📊",
              desc: "Runs all checker functions against the output. Optionally adds an LLM-as-judge pass for qualitative scoring.",
              color: "border-green-200 dark:border-green-800",
            },
          ].map(({ title, icon, desc, color }) => (
            <div key={title} className={`rounded-lg border ${color} p-3`}>
              <div className="text-lg mb-1">{icon}</div>
              <div className="font-semibold text-gray-800 dark:text-zinc-200 mb-1">{title}</div>
              <div className="text-gray-500 dark:text-zinc-400">{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 p-5 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          {/* Suite selector */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">
              Suite
            </label>
            <div className="flex gap-1">
              {suiteOptions.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  onClick={() => setSelectedSuite(value)}
                  disabled={isRunning}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                    selectedSuite === value
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600"
                  }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* LLM judge toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseLlmJudge((v) => !v)}
              disabled={isRunning}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${useLlmJudge ? "bg-indigo-600" : "bg-gray-300 dark:bg-zinc-600"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${useLlmJudge ? "translate-x-4" : "translate-x-1"}`} />
            </button>
            <label className="text-xs text-gray-600 dark:text-zinc-400">
              LLM-as-judge <span className="text-gray-400 dark:text-zinc-500">(slower, richer feedback)</span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={loadTestCases}
              disabled={isRunning || loadingTestCases}
              className="px-4 py-2 rounded-lg text-xs font-medium bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-zinc-300 hover:bg-gray-200 dark:hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingTestCases ? "Loading…" : "📋 Preview Tests"}
            </button>
            <button
              onClick={runEvals}
              disabled={isRunning}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Running…
                </>
              ) : (
                "▶ Run Evals"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      {/* Test case preview */}
      {testCases && !results && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3">
            📋 Test Cases ({testCases.length} total)
          </h3>
          <div className="space-y-2">
            {testCases
              .filter((tc) => selectedSuite === "all" || tc.metadata?.suite === selectedSuite)
              .map((tc, i) => {
                const suite = tc.metadata?.suite ?? "unknown";
                const info = SUITE_LABELS[suite] ?? { label: suite, emoji: "📋", color: "bg-gray-100 text-gray-700" };
                const difficulty = tc.metadata?.difficulty;
                return (
                  <div key={tc.id} className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                    <span className="text-xs font-mono text-gray-400 dark:text-zinc-500 mt-0.5 w-5 text-right flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${info.color}`}>
                          {info.emoji} {info.label}
                        </span>
                        {difficulty && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[difficulty] ?? ""}`}>
                            {difficulty}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 dark:text-zinc-500">{tc.checkCount} checks</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-zinc-200 font-medium truncate">{tc.input}</p>
                      <p className="text-xs text-gray-500 dark:text-zinc-400">{tc.description}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Running indicator */}
      {isRunning && (
        <div className="mb-6 p-6 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 text-center">
          <div className="flex justify-center mb-3">
            <span className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            Running evals… this may take a few minutes
          </p>
          <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">
            Each test case calls the live agent — pipeline tests run the full researcher → writer → editor chain
          </p>
        </div>
      )}

      {/* Results */}
      {results && metrics && (
        <div>
          <MetricsSummary metrics={metrics} />

          <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3">
            Test Results ({results.length})
          </h3>
          <div className="space-y-2">
            {results.map((result, i) => (
              <ResultCard key={result.testCase.id} result={result} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && !isRunning && !testCases && (
        <div className="text-center py-16 text-gray-400 dark:text-zinc-600">
          <div className="text-5xl mb-4">🧪</div>
          <p className="text-sm">Click <strong className="text-gray-600 dark:text-zinc-400">▶ Run Evals</strong> to start the evaluation suite</p>
          <p className="text-xs mt-1">or <button onClick={loadTestCases} className="underline hover:text-gray-600 dark:hover:text-zinc-400">preview the test cases</button> first</p>
        </div>
      )}
    </div>
  );
}
