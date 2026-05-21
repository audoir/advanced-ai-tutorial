# Chapter 1 — Multi-Agent Systems

## What is a Multi-Agent System?

A **multi-agent system** is a setup where multiple AI agents — each with a specialized role — collaborate to complete a task that would be difficult for a single agent to do well alone.

This chapter goes beyond simple sequential pipelines. Instead of hardcoding the order of agent calls, an **Orchestrator Agent** dynamically decides which specialist agents to invoke, in what order, and what to pass between them — all via MCP tool calls.

---

## Multi-Agent vs. Single-Agent: Advantages & Disadvantages

Before diving into the implementation, it's worth understanding *why* you'd reach for a multi-agent architecture in the first place — and when you probably shouldn't.

### Single-Agent System

A single-agent system uses one LLM call (or one persistent agent loop) to handle the entire task end-to-end.

```
User prompt → 🤖 Agent → Response
```

**Advantages**
- ✅ **Simple to build and debug** — one prompt, one model, one output.
- ✅ **Low latency** — no coordination overhead between agents.
- ✅ **Cheap** — fewer LLM calls means lower token costs.
- ✅ **Predictable** — easier to reason about what the model will do.
- ✅ **No coordination failures** — nothing to go wrong between agents.

**Disadvantages**
- ❌ **Context window limits** — stuffing everything into one prompt hits token limits fast.
- ❌ **Jack of all trades, master of none** — a single agent prompted to research, write, *and* edit tends to do each task worse than a specialist would.
- ❌ **Hard to parallelize** — one agent works sequentially; you can't easily fan out work.
- ❌ **Brittle for complex tasks** — long chains of reasoning in a single context degrade in quality.

---

### Multi-Agent System

A multi-agent system distributes work across several specialized agents, coordinated by an orchestrator.

```
User prompt → 🤖 Orchestrator Agent → 🔍 Researcher
                                    → ✍️  Writer
                                    → 📝 Editor
                                   → Final response
```

**Advantages**
- ✅ **Specialization** — each agent is prompted and tuned for one job, producing higher-quality outputs per step.
- ✅ **Parallelism** — independent agents can run concurrently, reducing wall-clock time.
- ✅ **Scalability** — adding a new capability means adding a new agent, not rewriting a monolithic prompt.
- ✅ **Longer effective context** — each agent only sees the context relevant to its task, sidestepping token limits.
- ✅ **Dynamic orchestration** — an Orchestrator Agent can adapt: retry a step, skip unnecessary steps, or call an agent multiple times based on intermediate results.
- ✅ **Separation of concerns** — easier to test, swap, or upgrade individual agents independently.

**Disadvantages**
- ❌ **Complexity** — more moving parts means more things that can go wrong.
- ❌ **Higher latency** — sequential agent calls add up; each hop introduces network and inference time.
- ❌ **Higher cost** — more LLM calls = more tokens = higher API bills.
- ❌ **Error propagation** — a bad output from an early agent can cascade and corrupt downstream agents.
- ❌ **Harder to debug** — tracing a failure across multiple agents and tool calls is more involved than reading a single prompt/response pair.
- ❌ **Coordination overhead** — the orchestrator itself can make mistakes about which agent to call or what to pass between them.

---

### When to Use Each

| Situation | Recommended Approach |
|-----------|----------------------|
| Simple Q&A or summarization | Single agent |
| Short, well-defined tasks | Single agent |
| Tasks that fit in one context window | Single agent |
| Complex, multi-step workflows | Multi-agent |
| Tasks requiring different expertise at each step | Multi-agent |
| High-volume pipelines where steps can run in parallel | Multi-agent |
| Tasks where quality per step matters more than speed/cost | Multi-agent |

---

## Architecture (This Chapter)

```
User prompt
    ↓
POST /api/multi-agent
    ↓
🤖 Orchestrator Agent  (gpt + agent MCP tools from /api/mcp/agents/mcp)
    │
    ├── calls researcher_agent(topic)
    │       └── Researcher Agent queries /api/mcp/database/mcp (database tools)
    │           → returns research report
    │
    ├── calls writer_agent(topic, research)
    │       └── Writer Agent drafts a blog post
    │           → returns article draft
    │
    └── calls editor_agent(draft)
            └── Editor Agent reviews and polishes
                → returns final article + editorial notes
    ↓
Orchestrator synthesizes and streams final response to user
```

### Two Layers of MCP

This example uses **two MCP servers** stacked together:

| MCP Server | Route | Exposes |
|------------|-------|---------|
| **Database MCP** | `/api/mcp/database/mcp` | `inventory`, `customers`, `sales` SQL tools |
| **Agent MCP** | `/api/mcp/agents/mcp` | `researcher_agent`, `writer_agent`, `editor_agent` tools |

The Orchestrator Agent connects to the **Agent MCP** server. The Researcher Agent (running inside the Agent MCP server) connects to the **Database MCP** server to query real data.

### The Specialist Agents

| Agent | MCP Tool Name | What it does |
|-------|--------------|--------------|
| 🔍 Researcher | `researcher_agent` | Queries the SQLite database via MCP, returns a data report |
| ✍️ Writer | `writer_agent` | Takes topic + research, writes a blog post draft |
| 📝 Editor | `editor_agent` | Reviews the draft, returns editorial feedback + final article |

### Why Orchestrator + MCP?

**Traditional sequential pipeline:**
```
code: researcher() → writer(research) → editor(draft)
```
The order is hardcoded. The orchestrator has no intelligence.

**Orchestrator Agent via MCP:**
```
Orchestrator LLM decides: "I should call researcher_agent first, then pass its output to writer_agent..."
```
The Orchestrator Agent *reasons* about which tools to call and in what order. It can adapt — for example, calling the researcher twice if the first result is insufficient, or skipping the editor for a simple summary request.

---

## The Database

The app uses an **in-memory SQLite database** (via `better-sqlite3`) seeded with sample business data:

| Table | Columns |
|-------|---------|
| `inventory` | id, product_name, category, unit_price, stock_quantity, supplier |
| `customers` | id, first_name, last_name, email, city, joined_date |
| `sales` | id, inventory_id, customer_id, quantity_sold, sale_price, sale_date |

The **View Database** tab lets you browse all three tables live.

---

## Key Files

| File | Purpose |
|------|---------|
| `app/api/multi-agent/route.ts` | Orchestrator Agent — connects to Agent MCP, streams response |
| `app/api/mcp/agents/[transport]/route.ts` | Agent MCP server — exposes 3 specialist agents as tools |
| `app/api/mcp/database/[transport]/route.ts` | Database MCP server — exposes SQL tools |
| `app/components/MultiAgentCrew.tsx` | Chat UI with streaming |
| `lib/db.ts` | SQLite database setup and seeding |
| `lib/sql-tools.ts` | Shared SQL tool definitions |
| `lib/prompts.ts` | Shared agent system prompts and user prompt templates |

---

## Running the App

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You'll see two tabs: **Multi-Agent Crew** (the chat interface) and **View Database** (a live browser for the SQLite tables).

In the **Multi-Agent Crew** tab, try one of the suggestion prompts — for example:

> *"Write a blog post about our best-selling electronics"*

Hit Enter and watch the Orchestrator Agent narrate each step as it calls the Researcher, Writer, and Editor agents in sequence.

---

## Walkthrough: File by File

### 1. `lib/db.ts` — The In-Memory Database

Everything starts with the database. `lib/db.ts` creates a singleton in-memory SQLite database using `better-sqlite3` and seeds it with sample data on first access.

```ts
// lib/db.ts
import Database from "better-sqlite3";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // In-memory SQLite database — lives only for the lifetime of the server process
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  // Three business tables are created and seeded:
  //   inventory  — 10 office products (keyboards, chairs, headphones, etc.)
  //   customers  — 8 customers across US cities
  //   sales      — 20 purchase records linking inventory ↔ customers
  // ...
  return db;
}
```

**Key points:**
- `":memory:"` means the database is **not persisted to disk** — it resets every time the Next.js server restarts.
- The function is a singleton: the first call creates and seeds the DB; subsequent calls return the same instance.
- Three tables are created: `inventory`, `customers`, and `sales` (with foreign keys linking sales to both).
- Two additional tables — `chat_sessions` and `chat_messages` — store conversation history so the Orchestrator Agent has multi-turn memory.

---

### 2. `lib/sql-tools.ts` — Shared SQL Tool Definitions

Rather than duplicating SQL execution logic in every route, `lib/sql-tools.ts` provides two reusable factories and the tool descriptions used by both the REST API and the MCP server.

```ts
// lib/sql-tools.ts
export const sqlInputSchema = z.object({
  sql: z.string().describe("A valid SQLite SELECT, INSERT, or UPDATE statement."),
  params: z.array(z.union([z.string(), z.number(), z.null()])).optional(),
});
```

**`makeSqlExecute(toolName)`** — returns a function that runs a SQL statement against the in-memory DB. It:
- Validates that the statement is `SELECT`, `INSERT`, or `UPDATE` (no `DROP`, `DELETE`, etc.)
- Returns rows for `SELECT`, or `{ insertedId, changes }` for writes

**`makeMcpSqlExecute(toolName)`** — wraps `makeSqlExecute` and formats the result as an MCP `content` array (`[{ type: "text", text: "..." }]`), which is the format MCP tool handlers must return.

**`TOOL_DESCRIPTIONS`** — a plain object with human-readable descriptions for each table tool. These are passed to `server.registerTool()` so the LLM knows what each tool does.

---

### 3. `lib/prompts.ts` — Shared Agent Prompts

All agent system prompts and user prompt templates live in `lib/prompts.ts`. This ensures the production agents and the eval runner always use exactly the same instructions.

```ts
// lib/prompts.ts
export const RESEARCHER_SYSTEM_PROMPT = `You are a Research Agent...`;
export function researcherUserPrompt(topic: string): string { ... }

export const WRITER_SYSTEM_PROMPT = `You are a Writer Agent...`;
export function writerUserPrompt(topic: string, research: string): string { ... }

export const EDITOR_SYSTEM_PROMPT = `You are an Editor Agent...`;
export function editorUserPrompt(article: string): string { ... }

export function orchestratorSystemPrompt(toolSummary: string): string { ... }
```

---

### 4. `app/api/mcp/database/[transport]/route.ts` — Database MCP Server

This file creates the **Database MCP server** — the innermost layer. It exposes three tools (`inventory`, `customers`, `sales`) that let any MCP client run SQL against the in-memory database.

```ts
// app/api/mcp/database/[transport]/route.ts
import { createMcpHandler } from "mcp-handler";
import { makeMcpSqlExecute, TOOL_DESCRIPTIONS, sqlInputSchema } from "@/lib/sql-tools";

function makeHandler(request: Request) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "inventory",
        {
          title: "Inventory Table",
          description: TOOL_DESCRIPTIONS.inventory,
          inputSchema: sqlInputSchema.shape,
        },
        makeMcpSqlExecute("inventory"),
      );

      server.registerTool("customers", { ... }, makeMcpSqlExecute("customers"));
      server.registerTool("sales",     { ... }, makeMcpSqlExecute("sales"));
    },
    {},
    { basePath: "/api/mcp/database", maxDuration: 60, verboseLogs: true },
  );
}

export async function GET(request: Request) { return makeHandler(request)(request); }
export async function POST(request: Request) { return makeHandler(request)(request); }
```

**Key points:**
- `createMcpHandler` (from `mcp-handler`) handles the MCP protocol negotiation — you just register tools.
- The `[transport]` dynamic segment in the file path means Next.js routes both `/api/mcp/database/mcp` (Streamable HTTP) and `/api/mcp/database/sse` (SSE) to the same handler.
- Each tool accepts `{ sql, params }` and returns JSON-formatted query results.

---

### 5. `app/api/mcp/agents/[transport]/route.ts` — Agent MCP Server

This is the **middle layer** — an MCP server that exposes the three specialist agents as tools. Each tool is itself a mini AI agent that calls an LLM (and, in the Researcher's case, calls the Database MCP server).

```ts
// app/api/mcp/agents/[transport]/route.ts
import { createMcpHandler } from "mcp-handler";
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import {
  RESEARCHER_SYSTEM_PROMPT, researcherUserPrompt,
  WRITER_SYSTEM_PROMPT, writerUserPrompt,
  EDITOR_SYSTEM_PROMPT, editorUserPrompt,
} from "@/lib/prompts";
```

#### Tool 1: `researcher_agent`

```ts
server.registerTool(
  "researcher_agent",
  {
    description: "Queries the business database via MCP to gather data insights on a given topic.",
    inputSchema: { topic: z.string() },
  },
  async ({ topic }) => {
    // Connect to the Database MCP server
    const mcpClient = await createMCPClient({
      transport: { type: "http", url: "http://localhost:3000/api/mcp/database/mcp" },
    });
    const dbTools = await mcpClient.tools();

    // Run a full LLM agent loop with the database tools
    const result = await generateText({
      model: openai(DEFAULT_MODEL),
      system: RESEARCHER_SYSTEM_PROMPT,
      prompt: researcherUserPrompt(topic),
      stopWhen: stepCountIs(10),
      tools: dbTools,
      onFinish: async () => { await mcpClient.close(); },
    });

    return { content: [{ type: "text", text: result.text }] };
  },
);
```

The Researcher Agent:
1. Opens a connection to the Database MCP server
2. Fetches the available SQL tools (`inventory`, `customers`, `sales`)
3. Runs `generateText` with those tools — the LLM can call them up to 10 times (`stepCountIs(10)`)
4. Returns a structured research report as plain text

#### Tool 2: `writer_agent`

```ts
server.registerTool(
  "writer_agent",
  {
    description: "Writes an engaging blog post draft based on a topic and research notes.",
    inputSchema: { topic: z.string(), research: z.string() },
  },
  async ({ topic, research }) => {
    const result = await generateText({
      model: openai(DEFAULT_MODEL),
      system: WRITER_SYSTEM_PROMPT,
      prompt: writerUserPrompt(topic, research),
    });
    return { content: [{ type: "text", text: result.text }] };
  },
);
```

The Writer Agent is simpler — no tool calls, just a single `generateText` call. It receives the research output from the Orchestrator and turns it into a 400–600 word markdown article.

#### Tool 3: `editor_agent`

```ts
server.registerTool(
  "editor_agent",
  {
    description: "Reviews and improves a blog article draft for clarity, SEO, and brand voice.",
    inputSchema: { article: z.string() },
  },
  async ({ article }) => {
    const result = await generateText({
      model: openai(DEFAULT_MODEL),
      system: EDITOR_SYSTEM_PROMPT,
      prompt: editorUserPrompt(article),
    });
    return { content: [{ type: "text", text: result.text }] };
  },
);
```

The Editor Agent takes the Writer's draft and returns two sections: an `## Editorial Review` with bullet-point feedback, and a `## Final Article` with the polished version.

---

### 6. `app/api/multi-agent/route.ts` — The Orchestrator Agent

This is the **top layer** — the route that the browser calls. It creates an Orchestrator Agent that connects to the Agent MCP server and uses the three specialist agents as tools.

```ts
// app/api/multi-agent/route.ts
import { openai } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { orchestratorSystemPrompt } from "@/lib/prompts";

export async function POST(req: Request) {
  const { prompt, sessionId } = await req.json();

  const db = getDb();
  const messages = initChatSession(db, sessionId, prompt);

  // Connect to the Agent MCP server
  const agentMcpClient = await createMCPClient({
    transport: { type: "http", url: "http://localhost:3000/api/mcp/agents/mcp" },
  });
  const agentTools = await agentMcpClient.tools();

  // Build a tool summary for the system prompt
  const toolSummary = Object.entries(agentTools)
    .map(([name, tool]) => `- **${name}**: ${tool.description ?? ""}`)
    .join("\n");

  const result = streamText({
    model: openai(DEFAULT_MODEL),
    system: orchestratorSystemPrompt(toolSummary),
    messages,
    stopWhen: stepCountIs(20),
    tools: agentTools,
    onFinish: async ({ text }) => {
      await agentMcpClient.close();
      saveAssistantMessage(db, sessionId, text);
    },
  });

  return result.toUIMessageStreamResponse();
}
```

**Key points:**
- `streamText` (not `generateText`) is used here so the response streams token-by-token to the browser.
- `stopWhen: stepCountIs(20)` caps the agent loop at 20 steps — enough for the full researcher → writer → editor pipeline with room to spare.
- `messages` comes from `initChatSession`, which loads the conversation history from SQLite so the Orchestrator has multi-turn memory.
- The tool summary is injected into the system prompt so the LLM knows what each specialist agent does before it decides which to call.
- `result.toUIMessageStreamResponse()` returns a streaming HTTP response in the format expected by the Vercel AI SDK's `useCompletion` hook on the client.

---

### 7. `app/components/MultiAgentCrew.tsx` — The Chat UI

The frontend is a React component that uses the Vercel AI SDK's `useCompletion` hook to stream the Orchestrator's response.

```ts
// app/components/MultiAgentCrew.tsx
const { completion, complete, isLoading, error } = useCompletion({
  api: "/api/multi-agent",
  body: { sessionId },
  onFinish: (_prompt, completion) => {
    setChatHistory((prev) => [...prev, { role: "assistant", content: completion }]);
  },
});
```

**Key points:**
- `useCompletion` sends a `POST` to `/api/multi-agent` with `{ prompt, sessionId }` in the body and streams the response back.
- While `isLoading` is true, the component shows the partial `completion` text with a blinking cursor — so users can watch the Orchestrator narrate each agent call in real time.
- The empty state renders a visual architecture diagram (Orchestrator → Researcher / Writer / Editor) and four suggestion prompts to get started quickly.
- The `sessionId` is managed by the `useSession` hook, which fetches a new session ID from `/api/session` on mount and persists it in component state. Clicking **Reset** calls `resetSession()` to start a fresh conversation.

---

## What Happens When You Send a Prompt

Here's the full request flow for the prompt *"Write a blog post about our best-selling electronics"*:

1. **Browser** → `POST /api/multi-agent` `{ prompt, sessionId }`
2. **Orchestrator Agent** reads the prompt and decides to call `researcher_agent("best-selling electronics")`
3. **Agent MCP server** receives the `researcher_agent` tool call, spins up a Researcher Agent
4. **Researcher Agent** → `POST /api/mcp/database/mcp` → calls `inventory` and `sales` SQL tools to find top-selling electronics
5. **Researcher Agent** returns a structured data report to the Orchestrator
6. **Orchestrator** calls `writer_agent(topic, researchReport)`
7. **Writer Agent** generates a 400–600 word markdown blog post
8. **Orchestrator** calls `editor_agent(draft)`
9. **Editor Agent** returns editorial feedback + polished final article
10. **Orchestrator** synthesizes everything and streams the final response back to the browser

Each step is narrated by the Orchestrator in the chat UI, so you can follow along as it works.

---

> **Next Steps:**
> - [Chapter 2: Observability with OpenTelemetry](./chapter-02-observability-with-opentelemetry.md)
