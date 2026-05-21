# Chapter 4 — Agent Topics

## The Problem with Chapter 1

In Chapter 1, the Orchestrator Agent passes the output of one specialist agent directly as a string argument to the next agent's tool call:

```
Orchestrator calls: researcher_agent(topic)
  → returns 2,000-character research report

Orchestrator calls: writer_agent(topic, "...2,000 chars of research pasted here...")
  → returns 3,000-character draft

Orchestrator calls: editor_agent("...3,000 chars of draft pasted here...")
  → returns final article
```

This works, but it has several problems:

| Problem | Impact |
|---------|--------|
| **Context window bloat** | The full research report is copy-pasted into the Orchestrator's context before being passed to the writer. For long outputs, this burns tokens fast. |
| **No persistence** | Intermediate outputs exist only in the Orchestrator's in-flight context. If the pipeline fails mid-way, all intermediate work is lost. |
| **Not inspectable** | There's no record of what the researcher produced, what the writer drafted, or when each step completed. |
| **Not resumable** | If the writer fails, you have to re-run the researcher too — there's no way to resume from the last successful step. |
| **Not scalable** | As pipelines grow (more agents, longer outputs), the copy-paste approach hits context limits and becomes unmanageable. |

---

## The Solution: Agent Topics

An **agent topic** is a named slot in the database where an agent writes its output. The next agent reads from that topic directly — it doesn't receive the data as a function argument.

This pattern is directly inspired by **pub/sub (publish-subscribe)** messaging systems like Kafka, Redis Pub/Sub, or Google Pub/Sub. In a classic pub/sub system:

- A **publisher** writes a message to a named **topic**
- A **subscriber** reads from that topic when it's ready
- The publisher and subscriber are **decoupled** — they never communicate directly

Agent topics apply the same idea to AI pipelines:

| Pub/Sub concept | Agent topics equivalent |
|-----------------|------------------------|
| Publisher | An agent that writes its output to a named topic |
| Subscriber | An agent that reads from a topic as its input |
| Topic | A named row in the `agent_topics` table, keyed by `(run_id, topic_name)` |
| Message broker | SQLite — the database acts as the shared message store |
| Message | The agent's full output (research report, draft, final article) |

The key insight is the same as pub/sub: **producers and consumers don't need to know about each other**. The researcher doesn't know the writer exists. The writer doesn't know the editor exists. They only know which topic to write to and which topic to read from. The Orchestrator coordinates the sequence, but it never touches the actual content.

The Orchestrator still exists and still drives the pipeline via MCP tool calls — just like Chapter 1. The key difference is what gets passed between agents:

**Chapter 1 — Orchestrator passes full content:**
```
Orchestrator context grows with each step:

[tool call: researcher_agent("electronics")]
[tool result: "## Research Report\n\n...(2,000 chars)..."]
[tool call: writer_agent("electronics", "## Research Report\n\n...(2,000 chars pasted again)...")]
[tool result: "# The Electronics Revolution\n\n...(3,000 chars)..."]
[tool call: editor_agent("# The Electronics Revolution\n\n...(3,000 chars pasted again)...")]
```

**Chapter 4 — Orchestrator passes runId and topic names:**
```
Orchestrator context stays small:

[tool call: researcher_agent("electronics", "run_abc", writeTopic="research")]
[tool result: "Research complete. Written to topic research:run_abc (1842 chars)"]
[tool call: writer_agent("electronics", "run_abc", readTopic="research", writeTopic="draft")]
[tool result: "Draft complete. Written to topic draft:run_abc (2931 chars)"]
[tool call: editor_agent("run_abc", readTopic="draft", writeTopic="final")]
[tool result: "Editing complete. Written to topic final:run_abc (3204 chars)"]
```

The agents read and write the actual content directly from/to the database. The Orchestrator only sees short confirmation messages.

---

## Architecture

```
Client → POST /api/topic-pipeline { prompt, runId }
    ↓
Orchestrator Agent (gpt + topic-aware agent MCP tools from /api/mcp/agents-topic/mcp)
    │
    ├── calls researcher_agent(topic, runId, writeTopic="research")
    │       └── Researcher Agent queries /api/mcp/database/mcp
    │           → writes output to agent_topics table (topic: "research")
    │           → returns short confirmation: "Research complete. Topic: research:run_abc"
    │
    ├── calls writer_agent(topic, runId, readTopic="research", writeTopic="draft")
    │       └── Writer Agent reads topic "research" from agent_topics
    │           → writes draft to agent_topics (topic: "draft")
    │           → returns short confirmation: "Draft complete. Topic: draft:run_abc"
    │
    └── calls editor_agent(runId, readTopic="draft", writeTopic="final")
            └── Editor Agent reads topic "draft" from agent_topics
                → writes final article to agent_topics (topic: "final")
                → returns short confirmation: "Editing complete. Topic: final:run_abc"
    ↓
Orchestrator streams final summary to user
```

### Two Layers of MCP (same as Chapter 1)

| MCP Server | Route | Exposes |
|------------|-------|---------|
| **Database MCP** | `/api/mcp/database/mcp` | `inventory`, `customers`, `sales` SQL tools |
| **Topic Agent MCP** | `/api/mcp/agents-topic/mcp` | `researcher_agent`, `writer_agent`, `editor_agent` tools (topic-aware) |

### The `agent_topics` Table

```sql
CREATE TABLE agent_topics (
  id           TEXT PRIMARY KEY,          -- "{runId}:{topicName}"
  run_id       TEXT NOT NULL,             -- groups all topics for one pipeline run
  topic_name   TEXT NOT NULL,             -- "research" | "draft" | "final"
  content      TEXT NOT NULL,             -- the agent's output
  agent_name   TEXT NOT NULL,             -- which agent wrote this
  created_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(run_id, topic_name)              -- one value per topic per run
)
```

Each pipeline run gets a unique `runId`. All three topics for that run share the same `run_id`, making it easy to query the full pipeline state:

```sql
SELECT topic_name, agent_name, length(content) AS chars, created_at
FROM agent_topics
WHERE run_id = 'run_1748123456789_abc123'
ORDER BY created_at;
```

---

## Benefits

| Benefit | How topics provide it |
|---------|----------------------|
| **No context bloat** | Only the topic ID (a short string) is passed between agents. The actual content stays in the DB. |
| **Persistence** | Every intermediate output is stored in SQLite. If the pipeline fails, completed stages are preserved. |
| **Resumability** | A failed pipeline can be resumed from the last successful topic write — no need to re-run earlier agents. |
| **Inspectability** | Any topic can be queried at any time: `SELECT * FROM agent_topics WHERE run_id = ?` |
| **Fan-out / fan-in** | Multiple agents can read from the same topic (fan-out), or one agent can read from multiple topics (fan-in). |
| **Live progress** | The UI can poll the database to show which topics have been written, giving real-time pipeline progress. |

---

## Key Files

| File | Purpose |
|------|---------|
| `app/api/topic-pipeline/route.ts` | Orchestrator Agent — connects to Topic Agent MCP, streams response |
| `app/api/mcp/agents-topic/[transport]/route.ts` | Topic Agent MCP server — exposes 3 topic-aware specialist agents as tools |
| `app/components/TopicPipeline.tsx` | UI — streams Orchestrator narration + polls DB for topic contents |

---

## Walkthrough: File by File

### 1. `app/api/mcp/agents-topic/[transport]/route.ts` — Topic-Aware Agent MCP Server

This is the Chapter 4 version of the Agent MCP server from Chapter 1. The agents accept a `runId` instead of full content strings.

#### Topic helpers

```ts
function writeTopic(runId: string, topicName: string, content: string, agentName: string) {
  const id = `${runId}:${topicName}`;
  db.prepare(`
    INSERT INTO agent_topics (id, run_id, topic_name, content, agent_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(run_id, topic_name) DO UPDATE SET content = excluded.content
  `).run(id, runId, topicName, content, agentName);
}

function readTopic(runId: string, topicName: string): string | null {
  const row = db.prepare(
    "SELECT content FROM agent_topics WHERE run_id = ? AND topic_name = ?"
  ).get(runId, topicName) as { content: string } | undefined;
  return row?.content ?? null;
}
```

#### Tool 1: `researcher_agent` (topic-aware)

```ts
server.registerTool(
  "researcher_agent",
  {
    description: "Queries the business database via MCP. Writes the research report to a database topic. Returns the topicId — the Orchestrator does NOT need to pass the full research text to the next agent.",
    inputSchema: {
      topic: z.string(),
      runId: z.string().describe("Unique run identifier — used as the topic key"),
      writeTopic: z.string().describe("The topic name to write the research output to (e.g. \"research\")"),
    },
  },
  async ({ topic, runId, writeTopic: writeTopicName }) => {
    // ... connect to Database MCP, run generateText ...

    // ✅ Write to topic — the Orchestrator never sees this content
    writeTopic(runId, writeTopicName, result.text, "researcher_agent");

    return {
      content: [{
        type: "text",
        text: `Research complete. Output written to topic "${writeTopicName}:${runId}" (${result.text.length} chars). Pass runId="${runId}" to writer_agent.`,
      }],
    };
  },
);
```

The researcher returns a short confirmation message — not the full research text. The Orchestrator's context only grows by ~100 characters per agent call, not 2,000+.

#### Tool 2: `writer_agent` (topic-aware)

```ts
server.registerTool(
  "writer_agent",
  {
    description: "Reads the research report from the database topic (using runId and readTopic). Writes the draft to writeTopic. The Orchestrator does NOT need to pass the research text.",
    inputSchema: {
      topic: z.string(),
      runId: z.string(),
      readTopic: z.string().describe("The topic name to read the research from (e.g. \"research\")"),
      writeTopic: z.string().describe("The topic name to write the draft to (e.g. \"draft\")"),
    },
  },
  async ({ topic, runId, readTopic: readTopicName, writeTopic: writeTopicName }) => {
    // ✅ Read from topic — no large string passed from Orchestrator
    const research = readTopic(runId, readTopicName);

    const result = await generateText({
      system: WRITER_SYSTEM_PROMPT,
      prompt: writerUserPrompt(topic, research),
    });

    // ✅ Write draft to topic
    writeTopic(runId, writeTopicName, result.text, "writer_agent");

    return {
      content: [{
        type: "text",
        text: `Draft complete. Output written to topic "${writeTopicName}:${runId}" (${result.text.length} chars).`,
      }],
    };
  },
);
```

The writer reads the research from the database (not from a function argument) and writes its draft to the database. The Orchestrator passes `topic`, `runId`, `readTopic`, and `writeTopic` — no large strings.

#### Tool 3: `editor_agent` (topic-aware)

```ts
server.registerTool(
  "editor_agent",
  {
    description: "Reads the article draft from the database topic (using runId and readTopic). Writes the final version to writeTopic. The Orchestrator does NOT need to pass the draft text.",
    inputSchema: {
      runId: z.string(),
      readTopic: z.string().describe("The topic name to read the draft from (e.g. \"draft\")"),
      writeTopic: z.string().describe("The topic name to write the final article to (e.g. \"final\")"),
    },
  },
  async ({ runId, readTopic: readTopicName, writeTopic: writeTopicName }) => {
    // ✅ Read from topic
    const draft = readTopic(runId, readTopicName);

    const result = await generateText({
      system: EDITOR_SYSTEM_PROMPT,
      prompt: editorUserPrompt(draft),
    });

    // ✅ Write final article to topic
    writeTopic(runId, writeTopicName, result.text, "editor_agent");

    return {
      content: [{
        type: "text",
        text: `Editing complete. Final article written to topic "${writeTopicName}:${runId}" (${result.text.length} chars).`,
      }],
    };
  },
);
```

The editor receives `readTopic` and `writeTopic` from the Orchestrator — it no longer has the topic names hardcoded.

---

### 2. `app/api/topic-pipeline/route.ts` — The Orchestrator Agent

This is the Chapter 4 counterpart to `app/api/multi-agent/route.ts`. It connects to the topic-aware Agent MCP server and streams the Orchestrator's narration to the browser.

```ts
export async function POST(req: Request) {
  const { prompt, runId } = await req.json();

  // Connect to the topic-aware Agent MCP server
  const agentMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents-topic/mcp",
    },
  });
  const agentTools = await agentMcpClient.tools();

  const result = streamText({
    model: openai(DEFAULT_MODEL),
    system: `You are an Orchestrator Agent...

IMPORTANT — How topics work:
- Each agent reads its input from a named topic in the database and writes its output to another named topic.
- You tell each agent which topic to read from (readTopic) and which topic to write to (writeTopic).
- You only need to pass the runId and short topic names between agents — never copy-paste content.

The runId for this pipeline run is: "${runId}"

Your job is to:
1. Call researcher_agent(topic, runId, writeTopic="research")
2. Call writer_agent(topic, runId, readTopic="research", writeTopic="draft")
3. Call editor_agent(runId, readTopic="draft", writeTopic="final")
4. Summarize what was accomplished`,
    messages: [{ role: "user", content: prompt }],
    stopWhen: stepCountIs(20),
    tools: agentTools,
    onFinish: async () => { await agentMcpClient.close(); },
  });

  return result.toUIMessageStreamResponse();
}
```

The Orchestrator's system prompt tells it to pass `readTopic` and `writeTopic` to each agent — the topic names flow from the Orchestrator down to the subagents, rather than being hardcoded inside each agent. The `runId` is generated by the client and passed in the request body.

---

### 3. `app/components/TopicPipeline.tsx` — The UI

The UI has two panels:

- **Left: Orchestrator Agent** — streams the Orchestrator's narration in real time (same as Chapter 1's `useCompletion` pattern)
- **Right: Database Topics** — after the pipeline completes, polls `GET /api/topic-pipeline?runId=...` to show the topic contents

```ts
const { completion, complete, isLoading, error } = useCompletion({
  api: "/api/topic-pipeline",
  onFinish: (_prompt, completion) => {
    setOrchestratorLog(completion);
  },
});

// After pipeline completes, fetch topic contents from the database
useEffect(() => {
  if (!isLoading && runId && orchestratorLog) {
    fetch(`/api/topic-pipeline?runId=${runId}`)
      .then(r => r.json())
      .then(data => setTopicData(data.topics));
  }
}, [isLoading, runId, orchestratorLog]);
```

The `runId` is generated client-side and passed to the API via `complete(prompt, { body: { runId } })`. This means the UI knows the `runId` before the pipeline starts, so it can poll for topic contents as soon as the pipeline finishes.

---

## Chapter 1 vs. Chapter 4: Side by Side

| Aspect | Chapter 1 | Chapter 4 |
|--------|-----------|-----------|
| **Agent MCP server** | `/api/mcp/agents/mcp` | `/api/mcp/agents-topic/mcp` |
| **Orchestrator route** | `/api/multi-agent` | `/api/topic-pipeline` |
| **researcher_agent args** | `(topic)` | `(topic, runId, writeTopic)` |
| **writer_agent args** | `(topic, research)` | `(topic, runId, readTopic, writeTopic)` |
| **editor_agent args** | `(article)` | `(runId, readTopic, writeTopic)` |
| **Agent return value** | Full content (2,000+ chars) | Short confirmation (~100 chars) |
| **Orchestrator context growth** | Large (full content per step) | Small (only confirmations) |
| **Intermediate outputs** | Lost after request | Persisted in `agent_topics` |
| **Resumable on failure** | No | Yes |
| **Inspectable via SQL** | No | Yes |

---

## Extending the Pattern

### Parallel agents (fan-out)

Multiple agents can write to different topics simultaneously:

```ts
// Run researcher and fact-checker in parallel
await Promise.all([
  runResearcher(runId, prompt),   // writes to topic "research"
  runFactChecker(runId, prompt),  // writes to topic "facts"
]);

// Writer reads from both topics
const research = readTopic(runId, "research");
const facts = readTopic(runId, "facts");
```

### Aggregator agent (fan-in)

One agent reads from multiple topics:

```ts
const research = readTopic(runId, "research");
const legal = readTopic(runId, "legal-review");
const seo = readTopic(runId, "seo-analysis");

const final = await generateText({
  prompt: `Combine:\n\nResearch: ${research}\n\nLegal: ${legal}\n\nSEO: ${seo}`,
});
```

### Resumable pipelines

```ts
// Only run the researcher if the topic is empty
const existingResearch = readTopic(runId, "research");
if (!existingResearch) {
  await runResearcher(runId, prompt);
}
// Always run the writer (it reads from the topic)
await runWriter(runId, prompt);
```

---

## Summary

| What changed from Chapter 1 | Why it matters |
|-----------------------------|----------------|
| New topic-aware Agent MCP server at `/api/mcp/agents-topic` | Agents accept `runId` + topic names instead of full content |
| Agents write outputs to named DB topics | Intermediate results are persisted and inspectable |
| Agents read inputs from DB topics | No large strings in the Orchestrator's context window |
| Orchestrator passes `runId`, `readTopic`, and `writeTopic` to each agent | Topic routing is controlled by the Orchestrator, not hardcoded in subagents |
| `agent_topics` table stores all outputs | Full pipeline history is queryable with SQL |
| `GET /api/topic-pipeline?runId=...` | Any run can be inspected after the fact |

The topic pattern is a foundational building block for scalable multi-agent systems. It decouples agents from each other — each agent only needs to know which topic to read from and which topic to write to, not anything about the agents upstream or downstream.

---

**Next Steps:**
- [Chapter 5: Data Pipelines for AI Agents](./chapter-05-data-pipelines.md)
