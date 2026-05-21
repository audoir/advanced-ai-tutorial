// ─── Eval Scorer ──────────────────────────────────────────────────────────────
//
// The scorer (or "grader") evaluates how well the actual output matches the
// expected criteria defined in each test case.
//
// Unlike traditional unit tests that use exact matching, evals need methods
// that account for the variability in AI outputs. This file provides:
//
//   1. Code-based scoring  — fast, deterministic checks (keyword presence,
//      regex patterns, length bounds, structural checks like markdown headings)
//
//   2. LLM-as-judge scoring — uses a second LLM call to evaluate quality
//      dimensions that are hard to express as code (coherence, tone, accuracy)
//
//   3. Aggregate metrics   — accuracy, pass rate, per-suite breakdown
//
// The primary scorer used in the eval runner is code-based (scoreResult).
// The LLM-as-judge scorer (scoreLlmJudge) is opt-in and used for richer
// qualitative feedback on pipeline outputs.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { DEFAULT_MODEL } from "@/lib/config";
import type { ScorerFn } from "./dataset";
import type { EvalRunResult } from "./runner";

// ── Code-based scorer ─────────────────────────────────────────────────────────
//
// Runs all checker functions against the output. ALL checks must pass for the
// test case to be considered passing (AND semantics).

export interface ScoreResult {
  passed: boolean;
  checkResults: boolean[];
}

export function scoreResult(output: string, checks: ScorerFn[]): ScoreResult {
  const checkResults = checks.map((check) => {
    try {
      return check(output);
    } catch {
      return false;
    }
  });

  const passed = checkResults.every(Boolean);
  return { passed, checkResults };
}

// ── LLM-as-judge scorer ───────────────────────────────────────────────────────
//
// Uses a second LLM call to evaluate the output on qualitative dimensions.
// Returns a structured score object with per-dimension ratings and reasoning.
//
// This is more expensive than code-based scoring (~1.5–2x cost) but catches
// issues that are hard to express as code: coherence, factual accuracy,
// tone, and overall quality.

export const LlmJudgeSchema = z.object({
  /** Overall pass/fail verdict */
  passed: z.boolean().describe("Whether the output meets the quality bar overall"),
  /** 0.0–1.0 score for each dimension */
  scores: z.object({
    relevance: z
      .number()
      .min(0)
      .max(1)
      .describe("How relevant is the output to the input prompt? (0=irrelevant, 1=perfectly relevant)"),
    accuracy: z
      .number()
      .min(0)
      .max(1)
      .describe("How factually accurate does the output appear? (0=hallucinated, 1=accurate)"),
    coherence: z
      .number()
      .min(0)
      .max(1)
      .describe("How coherent and well-structured is the output? (0=incoherent, 1=excellent)"),
    completeness: z
      .number()
      .min(0)
      .max(1)
      .describe("Does the output fully address the prompt? (0=incomplete, 1=complete)"),
  }),
  /** Brief reasoning for the verdict */
  reasoning: z.string().describe("1–3 sentence explanation of the verdict"),
});

export type LlmJudgeResult = z.infer<typeof LlmJudgeSchema>;

export async function scoreLlmJudge(
  input: string,
  output: string,
  description: string,
): Promise<LlmJudgeResult> {
  const { object } = await generateObject({
    model: openai(DEFAULT_MODEL),
    schema: LlmJudgeSchema,
    prompt: `You are an impartial AI evaluator. Your job is to assess the quality of an AI agent's output.

## Evaluation Task
**Test description:** ${description}

## Input (what the user asked)
${input}

## Output (what the AI agent produced)
${output}

## Instructions
Evaluate the output on four dimensions (each scored 0.0–1.0):
- **relevance**: Does the output address the input prompt?
- **accuracy**: Does the output appear factually correct (no hallucinations)?
- **coherence**: Is the output well-structured and easy to read?
- **completeness**: Does the output fully answer the question?

Set **passed** to true if all dimension scores are ≥ 0.6.
Provide a brief reasoning (1–3 sentences) explaining your verdict.`,
  });

  return object;
}

// ── Aggregate metrics ─────────────────────────────────────────────────────────
//
// Computes summary statistics across a set of eval run results.
// Mirrors the calculateMetrics function from the Vercel KB example.

export interface EvalMetrics {
  total: number;
  passed: number;
  failed: number;
  /** 0.0–1.0 pass rate */
  accuracy: number;
  /** Average duration in milliseconds */
  avgDurationMs: number;
  /** Per-suite breakdown */
  bySuite: Record<
    string,
    { total: number; passed: number; accuracy: number }
  >;
}

export function calculateMetrics(results: EvalRunResult[]): EvalMetrics {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  const accuracy = total > 0 ? passed / total : 0;
  const avgDurationMs =
    total > 0
      ? results.reduce((sum, r) => sum + r.durationMs, 0) / total
      : 0;

  // Group by suite
  const bySuite: EvalMetrics["bySuite"] = {};
  for (const result of results) {
    const suite = result.testCase.metadata?.suite ?? "unknown";
    if (!bySuite[suite]) {
      bySuite[suite] = { total: 0, passed: 0, accuracy: 0 };
    }
    bySuite[suite].total++;
    if (result.passed) bySuite[suite].passed++;
  }
  for (const suite of Object.keys(bySuite)) {
    const s = bySuite[suite];
    s.accuracy = s.total > 0 ? s.passed / s.total : 0;
  }

  return { total, passed, failed, accuracy, avgDurationMs, bySuite };
}

// ── Regression detection ──────────────────────────────────────────────────────
//
// Compares two sets of eval results (e.g., before and after a prompt change)
// and returns a list of regressions (tests that previously passed but now fail)
// and improvements (tests that previously failed but now pass).

export interface RegressionReport {
  regressions: string[];   // test IDs that regressed
  improvements: string[];  // test IDs that improved
  unchanged: string[];     // test IDs with no change
}

export function detectRegressions(
  before: EvalRunResult[],
  after: EvalRunResult[],
): RegressionReport {
  const beforeMap = new Map(before.map((r) => [r.testCase.id, r.passed]));
  const afterMap = new Map(after.map((r) => [r.testCase.id, r.passed]));

  const regressions: string[] = [];
  const improvements: string[] = [];
  const unchanged: string[] = [];

  for (const [id, afterPassed] of afterMap) {
    const beforePassed = beforeMap.get(id);
    if (beforePassed === undefined) continue; // new test, skip

    if (beforePassed && !afterPassed) {
      regressions.push(id);
    } else if (!beforePassed && afterPassed) {
      improvements.push(id);
    } else {
      unchanged.push(id);
    }
  }

  return { regressions, improvements, unchanged };
}
