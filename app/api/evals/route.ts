import { NextResponse } from "next/server";
import {
  ALL_EVAL_DATASETS,
  ALL_TEST_CASES,
  runEval,
  calculateMetrics,
  scoreLlmJudge,
} from "@/lib/evals";
import type { EvalSuiteName } from "@/lib/evals";

export const runtime = "nodejs";

// ─── Eval Runner API ──────────────────────────────────────────────────────────
//
// POST /api/evals
//
// Request body (all fields optional):
//   {
//     suite?:      "researcher" | "pipeline" | "safety"  — run a specific suite
//     testId?:     string                                 — run a single test case
//     llmJudge?:   boolean                               — also run LLM-as-judge scoring
//   }
//
// If neither suite nor testId is provided, all test cases are run.
//
// Response:
//   {
//     results:  EvalRunResult[]
//     metrics:  EvalMetrics
//   }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { suite, testId, llmJudge = false } = body as {
      suite?: EvalSuiteName;
      testId?: string;
      llmJudge?: boolean;
    };

    // Determine which test cases to run
    let testCases = ALL_TEST_CASES;

    if (testId) {
      const found = ALL_TEST_CASES.find((tc) => tc.id === testId);
      if (!found) {
        return NextResponse.json(
          { error: `Test case not found: ${testId}` },
          { status: 404 },
        );
      }
      testCases = [found];
    } else if (suite) {
      const dataset = ALL_EVAL_DATASETS[suite];
      if (!dataset) {
        return NextResponse.json(
          { error: `Unknown suite: ${suite}. Valid suites: ${Object.keys(ALL_EVAL_DATASETS).join(", ")}` },
          { status: 400 },
        );
      }
      testCases = dataset;
    }

    // Run all selected test cases sequentially
    // (sequential to avoid overwhelming the LLM API with concurrent requests)
    const results = [];
    for (const testCase of testCases) {
      const result = await runEval(testCase);

      // Optionally run LLM-as-judge scoring on top of code-based scoring
      let llmJudgeResult = undefined;
      if (llmJudge && result.output) {
        try {
          llmJudgeResult = await scoreLlmJudge(
            testCase.input,
            result.output,
            testCase.description,
          );
        } catch {
          // LLM judge failures are non-fatal — code-based score still applies
          llmJudgeResult = null;
        }
      }

      results.push({
        ...result,
        // Strip the ScorerFn functions (not JSON-serialisable) from the test case
        testCase: {
          id: result.testCase.id,
          input: result.testCase.input,
          description: result.testCase.description,
          metadata: result.testCase.metadata,
          checkCount: result.testCase.checks.length,
        },
        llmJudge: llmJudgeResult,
      });
    }

    const metrics = calculateMetrics(
      results.map((r) => ({
        testCase: testCases.find((tc) => tc.id === r.testCase.id)!,
        output: r.output,
        passed: r.passed,
        checkResults: r.checkResults,
        durationMs: r.durationMs,
        error: r.error,
      })),
    );

    return NextResponse.json({ results, metrics });
  } catch (err) {
    console.error("[/api/evals] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// GET /api/evals — returns the list of available test cases (no LLM calls)
export async function GET() {
  const testCases = ALL_TEST_CASES.map((tc) => ({
    id: tc.id,
    input: tc.input,
    description: tc.description,
    checkCount: tc.checks.length,
    metadata: tc.metadata,
  }));

  const suites = Object.fromEntries(
    Object.entries(ALL_EVAL_DATASETS).map(([name, cases]) => [
      name,
      cases.map((tc) => tc.id),
    ]),
  );

  return NextResponse.json({ testCases, suites, total: testCases.length });
}
