# Advanced AI Agent Tutorial

> **Prerequisites:** This tutorial is a continuation of the [AI Agent Tutorial](https://github.com/audoir/ai-agent-tutorial), which covers building AI agents from scratch — from a simple streaming chatbot to a LangGraph-powered agent with database tools served over MCP. Complete that tutorial first before proceeding here.

A hands-on Next.js project that walks you through advanced AI concepts — starting with **multi-agent systems**.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** You need an `OPENAI_API_KEY` environment variable set. Create a `.env.local` file:
>
> ```
> OPENAI_API_KEY=sk-...
> ```

---

## Chapters

| Chapter | Topic |
|---------|-------|
| [Chapter 1 — Multi-Agent Systems](./docs/chapter-01-multi-agent-systems.md) | What they are, how they work, and when to use them |
| [Chapter 2 — Observability with OpenTelemetry](./docs/chapter-02-observability-with-opentelemetry.md) | Tracing AI agents with OTel and visualizing in Jaeger |
| [Chapter 3 — Evals for AI Agents](./docs/chapter-03-evals.md) | Building a native eval framework: dataset, runner, scorer, and LLM-as-judge |
| [Chapter 4 — Agent Topics](./docs/chapter-04-agent-topics.md) | Persisting intermediate outputs in the database to eliminate context bloat |
| [Chapter 5 — Data Pipelines for AI Agents](./docs/chapter-05-data-pipelines.md) | How AI agent pipelines differ from traditional ETL, and how data flows through ingestion, processing, storage, retrieval, reasoning, and action |

📖 Full documentation lives in the [`docs/`](./docs/README.md) folder.

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `ai` | Vercel AI SDK — `generateText`, `streamText` |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/mcp` | MCP client for the AI SDK |
| `mcp-handler` | MCP server handler for Next.js |
| `@modelcontextprotocol/sdk` | Official MCP TypeScript SDK |
| `better-sqlite3` | Synchronous SQLite driver |
| `zod` | Schema validation for tool inputs |
