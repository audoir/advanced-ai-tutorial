// ─── Eval Runner ──────────────────────────────────────────────────────────────
//
// The runner (also called a "harness" or "executor") is the orchestration layer
// that executes test cases. It feeds inputs to the AI system, collects outputs,
// and manages the evaluation workflow.
//
// Two runners are provided:
//   - runResearcherEval: calls the researcher agent directly (fast, no pipeline)
//   - runPipelineEval:   calls the full orchestrator pipeline (slower, end-to-end)
//
// Both runners are model-agnostic — you can swap the model by changing the
// DEFAULT_MODEL env var without touching the runner logic.
// ─────────────────────────────────────────────────────────────────────────────

import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { DEFAULT_MODEL } from "@/lib/config";
import {
  RESEARCHER_SYSTEM_PROMPT,
  orchestratorSystemPrompt,
} from "@/lib/prompts";
import type { EvalTestCase } from "./dataset";
import { scoreResult } from "./scorer";

export interface EvalRunResult {
  testCase: EvalTestCase;
  output: string;
  passed: boolean;
  checkResults: boolean[];
  durationMs: number;
  error?: string;
}

// ── Runner 1: Researcher agent (direct) ──────────────────────────────────────
//
// Calls the researcher agent directly — connects to the Database MCP server
// and runs a generateText loop. This is the fastest runner and is used for
// the "researcher" eval suite.

export async function runResearcherEval(
  testCase: EvalTestCase,
): Promise<EvalRunResult> {
  const start = Date.now();

  try {
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
      prompt: testCase.input,
      stopWhen: stepCountIs(10),
      tools: dbTools,
      onFinish: async () => {
        await mcpClient.close();
      },
    });

    const durationMs = Date.now() - start;
    const { passed, checkResults } = scoreResult(result.text, testCase.checks);

    return {
      testCase,
      output: result.text,
      passed,
      checkResults,
      durationMs,
    };
  } catch (err) {
    return {
      testCase,
      output: "",
      passed: false,
      checkResults: testCase.checks.map(() => false),
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Runner 2: Full orchestrator pipeline ─────────────────────────────────────
//
// Calls the full orchestrator pipeline via the Agent MCP server.
// This exercises the complete researcher → writer → editor chain.
// Used for the "pipeline" and "safety" eval suites.

export async function runPipelineEval(
  testCase: EvalTestCase,
): Promise<EvalRunResult> {
  const start = Date.now();

  try {
    const agentMcpClient = await createMCPClient({
      transport: {
        type: "http",
        url: "http://localhost:3000/api/mcp/agents/mcp",
      },
    });

    const agentTools = await agentMcpClient.tools();

    const toolSummary = Object.entries(agentTools)
      .map(([name, tool]) => `- **${name}**: ${tool.description ?? ""}`)
      .join("\n");

    const result = await generateText({
      model: openai(DEFAULT_MODEL),
      system: orchestratorSystemPrompt(toolSummary),
      prompt: testCase.input,
      stopWhen: stepCountIs(20),
      tools: agentTools,
      onFinish: async () => {
        await agentMcpClient.close();
      },
    });

    const durationMs = Date.now() - start;
    const { passed, checkResults } = scoreResult(result.text, testCase.checks);

    return {
      testCase,
      output: result.text,
      passed,
      checkResults,
      durationMs,
    };
  } catch (err) {
    return {
      testCase,
      output: "",
      passed: false,
      checkResults: testCase.checks.map(() => false),
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Runner dispatcher ─────────────────────────────────────────────────────────
//
// Picks the right runner based on the test case's suite metadata.

export async function runEval(testCase: EvalTestCase): Promise<EvalRunResult> {
  const suite = testCase.metadata?.suite ?? "pipeline";

  if (suite === "researcher") {
    return runResearcherEval(testCase);
  }

  // "pipeline" and "safety" suites both use the full orchestrator
  return runPipelineEval(testCase);
}
