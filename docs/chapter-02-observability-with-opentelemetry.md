# Chapter 2 — Observability with OpenTelemetry

## What is Observability?

**Observability** is the ability to understand what's happening inside your system by examining its outputs — without having to add new instrumentation every time something goes wrong.

For AI agent systems, observability is especially important because:

- **Agents make multiple LLM calls** — a single user request can trigger 5–15 LLM calls across the Orchestrator, Researcher, Writer, and Editor agents.
- **Latency compounds** — each agent hop adds latency; without tracing you can't tell which step is slow.
- **Token costs are invisible** — without telemetry you don't know which agent is burning the most tokens.
- **Failures are hard to diagnose** — when the Orchestrator calls the Researcher which calls the Database MCP, a failure anywhere in that chain is hard to trace without distributed tracing.

This chapter adds **OpenTelemetry (OTel)** tracing to the multi-agent system from Chapter 1 and visualizes the traces in **Jaeger**.

---

## What is OpenTelemetry?

[OpenTelemetry](https://opentelemetry.io/) is an open-source, vendor-neutral observability framework. It provides:

- **Traces** — a record of the path a request takes through your system, broken into **spans** (individual units of work).
- **Metrics** — numerical measurements over time (request counts, latencies, error rates).
- **Logs** — structured event records.

This chapter focuses on **traces**. A trace is a tree of spans:

```
Trace: "Write a blog post about electronics"
│
├── [span] orchestrator.handleRequest                  ~12s
│     ├── [span] orchestrator.connectAgentMCP          ~0.03s
│     ├── [span] ai.streamText (orchestrator-agent)    ~12s
│     │     ├── [span] ai.streamText.doStream          ~12s
│     │     │     ├── [span] ai.toolCall: researcher_agent   ~5s
│     │     │     ├── [span] ai.toolCall: writer_agent       ~4s
│     │     │     └── [span] ai.toolCall: editor_agent       ~3s
│     │     └── ...
│
├── [span] researcher_agent.run                        ~5s
│     ├── [span] researcher_agent.connectDatabaseMCP   ~0.02s
│     ├── [span] ai.generateText (researcher-agent)    ~5s
│     │     ├── [span] ai.toolCall: inventory          ~0.1s
│     │     ├── [span] ai.toolCall: sales              ~0.1s
│     │     └── [span] ai.toolCall: customers          ~0.1s
│
├── [span] writer_agent.run                            ~4s
│     └── [span] ai.generateText (writer-agent)        ~4s
│
└── [span] editor_agent.run                            ~3s
      └── [span] ai.generateText (editor-agent)        ~3s
```

Each span records:
- **Start time and duration**
- **Model used** (`gen_ai.request.model`)
- **Token usage** (`gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`)
- **Finish reason** (`ai.response.finishReason`)
- **Custom metadata** (e.g., `sessionId`, `topic`)

---

## What is Jaeger?

[Jaeger](https://www.jaegertracing.io/) is an open-source distributed tracing backend. It:

- Receives traces via the **OTLP protocol** (OpenTelemetry's wire format)
- Stores them in memory (for local dev) or a persistent backend (Elasticsearch, Cassandra, etc.)
- Provides a **web UI** at `http://localhost:16686` for searching and visualizing traces

Jaeger is the perfect local development companion for OTel — it's a single Docker command to start.

---

## Architecture

```
Next.js App (instrumented with OTel)
    │
    │  OTLP/HTTP  (port 4318)
    ▼
Jaeger all-in-one
    │
    ▼
Jaeger UI  →  http://localhost:16686
```

The AI SDK's `experimental_telemetry` option emits spans automatically for every `generateText` and `streamText` call. The OTel SDK (configured in `instrumentation.node.ts`) batches and forwards those spans to Jaeger over HTTP.

---

## How Chapter 2 Relates to Chapter 1

Chapter 2 adds observability **on top of** the Chapter 1 multi-agent system. Rather than modifying the Chapter 1 files, it introduces new parallel files:

| Chapter 1 (no OTel) | Chapter 2 (with OTel) |
|---------------------|----------------------|
| `app/api/multi-agent/route.ts` | `app/api/multi-agent-otel/route.ts` |
| `app/api/mcp/agents/[transport]/route.ts` | `app/api/mcp/agents-otel/[transport]/route.ts` |
| `app/components/MultiAgentCrew.tsx` | `app/components/MultiAgentCrewOtel.tsx` |

The Chapter 1 files remain clean and simple — no OTel imports. The Chapter 2 files add tracing on top of the same underlying logic, using the same shared `lib/prompts.ts`, `lib/db.ts`, and `lib/sql-tools.ts`.

The **🔭 OTel Tracing** tab in the app uses the Chapter 2 routes. The **🤝 Multi-Agent Crew** tab uses the Chapter 1 routes.

---

## Step 1: Start Jaeger

Jaeger ships as a single Docker image. Start it with:

```bash
docker run --rm --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  -p 5778:5778 \
  -p 9411:9411 \
  cr.jaegertracing.io/jaegertracing/jaeger:2.18.0
```

| Port | Protocol | Purpose |
|------|----------|---------|
| `16686` | HTTP | Jaeger UI |
| `4317` | gRPC | OTLP/gRPC receiver |
| `4318` | HTTP | OTLP/HTTP receiver ← used by this app |

Open [http://localhost:16686](http://localhost:16686) — you should see the Jaeger UI (empty for now).

---

## Step 2: Install OpenTelemetry Packages

```bash
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/sdk-trace-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/api
```

| Package | Purpose |
|---------|---------|
| `@opentelemetry/sdk-node` | `NodeSDK` — the main OTel SDK for Node.js |
| `@opentelemetry/resources` | `resourceFromAttributes` — describes the service |
| `@opentelemetry/semantic-conventions` | Standard attribute names (`ATTR_SERVICE_NAME`, etc.) |
| `@opentelemetry/sdk-trace-node` | `SimpleSpanProcessor` — processes and exports spans |
| `@opentelemetry/exporter-trace-otlp-http` | `OTLPTraceExporter` — sends spans to Jaeger via HTTP |
| `@opentelemetry/api` | Core OTel API (used by the AI SDK internally) |

---

## Step 3: Create the Instrumentation Files

Next.js automatically loads `instrumentation.ts` from the project root before any route handlers run. This is the entry point for OTel setup.

### `instrumentation.ts` — Entry Point

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
```

**Why the `NEXT_RUNTIME` check?**

Next.js can run route handlers in two runtimes:
- **Node.js** — the default; has access to all Node.js APIs.
- **Edge** — a lightweight V8 runtime; does *not* support Node.js APIs.

The `@opentelemetry/sdk-node` package uses Node.js-specific APIs (like `process`, `Buffer`, native modules). Importing it in the Edge runtime would crash. The `NEXT_RUNTIME === "nodejs"` guard ensures the OTel SDK is only loaded in the Node.js runtime.

The `register()` function is called once when the Next.js server starts — before any requests are handled.

---

### `instrumentation.node.ts` — OTel SDK Configuration

```ts
// instrumentation.node.ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? "advanced-ai-tutorial",
  }),
  spanProcessor: new SimpleSpanProcessor(
    new OTLPTraceExporter({
      url: `${otlpEndpoint}/v1/traces`,
    }),
  ),
});

sdk.start();
```

Let's break down each piece:

#### `resourceFromAttributes`

A **Resource** describes the entity producing the telemetry — in this case, our Next.js service. The `ATTR_SERVICE_NAME` attribute (`"service.name"`) is what Jaeger uses to group traces under a service name in its UI. You'll see `advanced-ai-tutorial` in the **Service** dropdown in Jaeger.

#### `OTLPTraceExporter`

The exporter sends completed spans to the backend using the **OTLP/HTTP** protocol. The default endpoint is `http://localhost:4318/v1/traces`, which is exactly where Jaeger's all-in-one image listens.

#### `SimpleSpanProcessor`

A **SpanProcessor** decides what to do with a span when it finishes. `SimpleSpanProcessor` exports each span immediately and synchronously — ideal for development because you see traces in Jaeger right away.

> **Production note:** In production, use `BatchSpanProcessor` instead. It buffers spans and sends them in batches, which is much more efficient.

#### `sdk.start()`

This initializes the OTel SDK and registers it as the global tracer provider. After this call, any code that uses `@opentelemetry/api` (including the AI SDK's telemetry internals) will automatically route spans through this SDK.

---

## Step 4: Enable Telemetry on AI SDK Calls

The AI SDK's telemetry is opt-in per call via the `experimental_telemetry` option. Add it to each `generateText` / `streamText` call:

### Orchestrator Agent (`app/api/multi-agent-otel/route.ts`)

```ts
const result = streamText({
  model: openai(DEFAULT_MODEL),
  experimental_telemetry: {
    isEnabled: true,
    functionId: "orchestrator-agent",   // shown as resource.name in Jaeger
    metadata: { sessionId },            // custom attributes on the span
  },
  // ... rest of options
});
```

### Researcher Agent (`app/api/mcp/agents-otel/[transport]/route.ts`)

```ts
const result = await generateText({
  model: openai(DEFAULT_MODEL),
  experimental_telemetry: {
    isEnabled: true,
    functionId: "researcher-agent",
    metadata: { topic },
  },
  // ...
});
```

### Writer Agent

```ts
const result = await generateText({
  model: openai(DEFAULT_MODEL),
  experimental_telemetry: {
    isEnabled: true,
    functionId: "writer-agent",
    metadata: { topic },
  },
  // ...
});
```

### Editor Agent

```ts
const result = await generateText({
  model: openai(DEFAULT_MODEL),
  experimental_telemetry: {
    isEnabled: true,
    functionId: "editor-agent",
  },
  // ...
});
```

### `experimental_telemetry` Options

| Option | Type | Description |
|--------|------|-------------|
| `isEnabled` | `boolean` | Must be `true` to emit spans |
| `functionId` | `string` | Sets `resource.name` and `operation.name` on the span — used to identify which function produced the trace |
| `metadata` | `Record<string, string \| number \| boolean>` | Custom key-value pairs attached to the span as `ai.telemetry.metadata.*` attributes |
| `recordInputs` | `boolean` | Whether to record prompt/messages (default: `true`) |
| `recordOutputs` | `boolean` | Whether to record generated text (default: `true`) |

---

## Step 5: Environment Variables

The instrumentation respects two environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | Base URL of the OTLP collector |
| `OTEL_SERVICE_NAME` | `advanced-ai-tutorial` | Service name shown in Jaeger |

For local development with Jaeger running on the default ports, no configuration is needed. For a remote Jaeger instance, set:

```bash
# .env.local
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-jaeger-host:4318
OTEL_SERVICE_NAME=my-app-name
```

---

## Step 6: Run the App and Generate Traces

1. **Start Jaeger** (if not already running — see Step 1).

2. **Start the Next.js app**:
   ```bash
   npm run dev
   ```

3. **Send a prompt** — open [http://localhost:3000](http://localhost:3000), click the **🔭 OTel Tracing** tab, and type something like:
   > *"Write a blog post about our best-selling electronics"*

4. **View the trace** — open [http://localhost:16686](http://localhost:16686):
   - In the **Service** dropdown on the left, select **`advanced-ai-tutorial`**
   - In the **Operation** dropdown, select **`ai.streamText`** (this is the root span emitted by the Orchestrator)
   - In the **Sort** dropdown (top-right of the results panel), choose **Longest First** or **Most Spans** to surface the most interesting traces
   - Click **Find Traces**
   - Click on the most recent trace to open the waterfall view

You'll see a waterfall view of all the spans generated by the multi-agent pipeline.

---

## What You'll See in Jaeger

### The Trace Waterfall

With manual context propagation in place (see Step 8 below), all four agents produce **one unified trace** in Jaeger. You will see a single waterfall that spans the entire request from the Orchestrator down through every specialist agent:

```
▼ orchestrator.handleRequest  [session.id="abc123"]                   12.4s
  ▼ orchestrator.connectAgentMCP                                        0.03s
  ▼ ai.streamText  [orchestrator-agent]                                12.4s
    ▼ ai.streamText.doStream  [orchestrator-agent]                     12.4s
        ai.toolCall: researcher_agent                                    5.1s
        ai.toolCall: writer_agent                                        4.2s
        ai.toolCall: editor_agent                                        3.1s
  ▼ researcher_agent.run  [research.topic="best-selling electronics"]   5.1s
    ▼ researcher_agent.connectDatabaseMCP                               0.02s
    ▼ ai.generateText  [researcher-agent]                               5.0s
      ▼ ai.generateText.doGenerate  [researcher-agent]                  5.0s
          ai.toolCall: inventory                                         0.08s
          ai.toolCall: sales                                             0.09s
          ai.toolCall: customers                                         0.07s
  ▼ writer_agent.run  [article.topic="best-selling electronics"]        4.2s
    ▼ ai.generateText  [writer-agent]                                   4.2s
      ▼ ai.generateText.doGenerate  [writer-agent]                      4.2s
  ▼ editor_agent.run                                                    3.1s
    ▼ ai.generateText  [editor-agent]                                   3.1s
      ▼ ai.generateText.doGenerate  [editor-agent]                      3.1s
```

> **Without** manual context propagation you would instead see **four separate orphaned traces** — one per agent — with no parent-child relationship between them. See Step 8 for how this is fixed.

### Span Attributes

Click on any span to see its attributes. For an `ai.generateText.doGenerate` span you'll see:

| Attribute | Example Value |
|-----------|---------------|
| `ai.model.id` | `gpt-4o-mini` |
| `ai.model.provider` | `openai` |
| `gen_ai.request.model` | `gpt-4o-mini` |
| `gen_ai.usage.input_tokens` | `342` |
| `gen_ai.usage.output_tokens` | `187` |
| `ai.response.finishReason` | `stop` |
| `ai.telemetry.functionId` | `researcher-agent` |
| `ai.telemetry.metadata.topic` | `best-selling electronics` |
| `resource.name` | `researcher-agent` |

For `ai.toolCall` spans:

| Attribute | Example Value |
|-----------|---------------|
| `ai.toolCall.name` | `inventory` |
| `ai.toolCall.id` | `call_abc123` |
| `ai.toolCall.args` | `{"sql": "SELECT ..."}` |
| `ai.toolCall.result` | `[{"product_name": "..."}]` |

### Next.js Built-in Spans

Next.js automatically emits its own spans for every HTTP request:

| Span | What it represents |
|------|--------------------|
| `GET /` | Root HTTP request span |
| `POST /api/multi-agent-otel` | The API route handler |
| `render route (app) /` | React Server Component rendering |
| `executing api route (app) /api/multi-agent-otel` | Route handler execution |

These are nested under the HTTP request span, giving you a complete picture from HTTP request all the way down to individual LLM token counts.

### Span Types Emitted by the AI SDK

The AI SDK emits the following span types (all prefixed with `ai.`):

**For `streamText` (Orchestrator):**

| Span | Description |
|------|-------------|
| `ai.streamText` | Full duration of the `streamText` call, including all steps |
| `ai.streamText.doStream` | Individual provider call (one per step) |
| `ai.toolCall` | Each tool call made during the stream |

**For `generateText` (Researcher, Writer, Editor):**

| Span | Description |
|------|-------------|
| `ai.generateText` | Full duration of the `generateText` call |
| `ai.generateText.doGenerate` | Individual provider call (one per step) |
| `ai.toolCall` | Each tool call (Researcher only — calls DB tools) |

**Key attributes on LLM spans:**

| Attribute | Description |
|-----------|-------------|
| `ai.usage.promptTokens` | Input tokens used |
| `ai.usage.completionTokens` | Output tokens generated |
| `ai.response.finishReason` | Why generation stopped (`stop`, `tool-calls`, `length`) |
| `ai.prompt` | The full prompt (if `recordInputs: true`) |
| `ai.response.text` | The generated text (if `recordOutputs: true`) |

---

## Step 7: Add Custom Spans

The AI SDK's `experimental_telemetry` gives you automatic spans for every LLM call, but sometimes you need to trace your **own** business logic — connecting to an MCP server, building a prompt, or any block of code you want to measure independently.

OpenTelemetry's `@opentelemetry/api` package (already installed) lets you create **custom spans** that appear alongside the AI SDK spans in Jaeger.

### The Core Pattern

```ts
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("advanced-ai-tutorial");

const result = await tracer.startActiveSpan("my-span-name", async (span) => {
  span.setAttribute("some.key", "some-value");
  try {
    return await doSomething();
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw err;
  } finally {
    span.end(); // always end the span
  }
});
```

`startActiveSpan` creates a span, makes it the **active** span (so any child spans created inside are automatically nested under it), and passes it to your callback. The `finally` block ensures `span.end()` is always called — a span that is never ended will never be exported.

### Orchestrator Agent (`app/api/multi-agent-otel/route.ts`)

We wrap the entire request handler in an `orchestrator.handleRequest` span and add a child span for the MCP connection step:

```ts
import { trace, SpanStatusCode, propagation, context } from "@opentelemetry/api";

const tracer = trace.getTracer("advanced-ai-tutorial");

export async function POST(req: Request) {
  // ...

  return tracer.startActiveSpan("orchestrator.handleRequest", async (requestSpan) => {
    requestSpan.setAttribute("session.id", sessionId);
    requestSpan.setAttribute("prompt.length", prompt?.length ?? 0);

    try {
      // ...

      // Child span: measure how long the MCP connection takes
      const agentMcpClient = await tracer.startActiveSpan(
        "orchestrator.connectAgentMCP",
        async (mcpSpan) => {
          try {
            return await createMCPClient({ /* ... */ });
          } finally {
            mcpSpan.end();
          }
        },
      );

      // Record which tools are available
      requestSpan.setAttribute("agent.tools.count", Object.keys(agentTools).length);
      requestSpan.setAttribute("agent.tools.names", Object.keys(agentTools).join(", "));

      const result = streamText({
        // ...
        onFinish: async ({ text }) => {
          requestSpan.setAttribute("response.length", text.length);
          requestSpan.setStatus({ code: SpanStatusCode.OK });
          requestSpan.end(); // end after streaming completes
        },
      });

      return result.toUIMessageStreamResponse();
    } catch (err) {
      requestSpan.recordException(err as Error);
      requestSpan.setStatus({ code: SpanStatusCode.ERROR });
      requestSpan.end();
      throw err;
    }
  });
}
```

### Specialist Agents (`app/api/mcp/agents-otel/[transport]/route.ts`)

Each agent tool handler is wrapped in its own custom span. The researcher also gets a child span for its MCP connection:

```ts
import { trace, SpanStatusCode, propagation, context } from "@opentelemetry/api";

const tracer = trace.getTracer("advanced-ai-tutorial");

// Researcher Agent
async ({ topic }: { topic: string }) => {
  return tracer.startActiveSpan("researcher_agent.run", async (agentSpan) => {
    agentSpan.setAttribute("research.topic", topic);

    try {
      // Child span: measure the database MCP connection
      const mcpClient = await tracer.startActiveSpan(
        "researcher_agent.connectDatabaseMCP",
        async (mcpSpan) => {
          try {
            return await createMCPClient({ /* ... */ });
          } finally {
            mcpSpan.end();
          }
        },
      );

      const dbTools = await mcpClient.tools();
      agentSpan.setAttribute("db.tools.count", Object.keys(dbTools).length);

      const result = await generateText({ /* ... */ });

      agentSpan.setAttribute("research.output.length", result.text.length);
      agentSpan.setStatus({ code: SpanStatusCode.OK });
      return { content: [{ type: "text", text: result.text }] };
    } catch (err) {
      agentSpan.recordException(err as Error);
      agentSpan.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      agentSpan.end();
    }
  });
}
```

### Custom Span Quick Reference

| API | Description |
|-----|-------------|
| `trace.getTracer('name')` | Get (or create) a named tracer |
| `tracer.startActiveSpan('name', fn)` | Create a span and make it the active context |
| `span.setAttribute('key', value)` | Attach a string, number, or boolean attribute |
| `span.setStatus({ code, message })` | Set `OK` or `ERROR` status |
| `span.recordException(err)` | Record an exception on the span |
| `span.end()` | Finalize and export the span — **always required** |

---

## Step 8: Fix Orphaned Spans with Manual Context Propagation

### The Problem

The specialist agents (Researcher, Writer, Editor) are invoked via **HTTP fetch calls** through the MCP protocol. The OTel SDK's automatic HTTP instrumentation only patches Node's built-in `http`/`https` modules — it does **not** patch the Web `fetch` API, which is what `createMCPClient` uses internally (`HttpMCPTransport`).

Because of this, when the Orchestrator calls `researcher_agent` via MCP over fetch, the `traceparent` header is **never injected** into the outgoing HTTP request. When the agent route handler runs on the other side, it starts a brand new trace with no parent — creating an **orphaned span**.

### The Fix

The solution is two-sided:

1. **Orchestrator** — serialize the current OTel context into HTTP headers and pass them to `createMCPClient` via the transport's `headers` option.
2. **Agent MCP server** — extract those headers from the incoming request and restore the parent context before creating any spans.

### Orchestrator: Inject the Trace Context (`app/api/multi-agent-otel/route.ts`)

```ts
import { trace, SpanStatusCode, propagation, context } from "@opentelemetry/api";

// Inside the POST handler, after startActiveSpan:

// Serialize the current OTel context into HTTP headers.
// propagation.inject() writes the W3C traceparent (and tracestate) headers
// into the carrier object using the globally registered propagator.
const traceCarrier: Record<string, string> = {};
propagation.inject(context.active(), traceCarrier);

const agentMcpClient = await createMCPClient({
  transport: {
    type: "http",
    url: "http://localhost:3000/api/mcp/agents-otel/mcp",
    // Pass the serialized context as transport-level headers.
    // Every HTTP request this client makes will include traceparent.
    headers: traceCarrier,
  },
});
```

`propagation.inject()` writes the W3C `traceparent` header (e.g. `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`) into the carrier object. The `headers` option on the MCP transport config forwards these headers on every HTTP request the client makes.

### Agent MCP Server: Extract and Restore the Context (`app/api/mcp/agents-otel/[transport]/route.ts`)

```ts
import { trace, SpanStatusCode, propagation, context } from "@opentelemetry/api";

function makeHandler(request: Request) {
  // Read all incoming request headers into a plain object.
  const carrier: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    carrier[key] = value;
  });

  // Restore the parent OTel context from the traceparent header.
  // If no traceparent is present, parentContext is just the root context
  // and spans will still be created — just without a parent.
  const parentContext = propagation.extract(context.active(), carrier);

  return createMcpHandler((server) => {
    server.registerTool("researcher_agent", { /* ... */ },
      async ({ topic }) => {
        // context.with() makes parentContext the active context for the
        // duration of the callback. Any spans created inside will be
        // children of the Orchestrator's active span.
        return context.with(parentContext, () =>
          tracer.startActiveSpan("researcher_agent.run", async (agentSpan) => {
            // ... all the existing logic
          }),
        );
      },
    );

    // Same pattern for writer_agent and editor_agent
  });
}
```

`propagation.extract()` reads the `traceparent` header from the carrier and reconstructs the parent `SpanContext`. `context.with(parentContext, fn)` then makes that context active for the duration of `fn` — so `tracer.startActiveSpan(...)` inside creates a child span of the Orchestrator's span rather than a new root.

### Why `context.with()` Instead of Just Passing the Context?

`startActiveSpan` automatically uses the **currently active** context to determine the parent span. By wrapping the call in `context.with(parentContext, ...)`, we temporarily replace the active context with the one we extracted from the request headers. Without this wrapper, the active context would be the default empty context (no parent), and the span would be a root span.

### The Result

After this change, all four agents produce **one unified trace** in Jaeger. The full waterfall — from the Orchestrator's `handleRequest` span down through every `ai.generateText` and `ai.toolCall` — is visible in a single trace view.

---

## Key Files

| File | Purpose |
|------|---------|
| `instrumentation.ts` | Next.js entry point — loads OTel before any routes run |
| `instrumentation.node.ts` | Configures the OTel SDK to export to Jaeger via OTLP/HTTP |
| `app/api/multi-agent-otel/route.ts` | Orchestrator Agent with OTel spans + context propagation |
| `app/api/mcp/agents-otel/[transport]/route.ts` | Agent MCP server with OTel spans + context extraction |
| `app/components/MultiAgentCrewOtel.tsx` | Chat UI — same as Chapter 1 but hits the OTel routes |

---

## Disabling Input/Output Recording

By default, the AI SDK records the full prompt and response text in span attributes. This is great for debugging but may be undesirable for:

- **Privacy** — prompts may contain sensitive user data
- **Cost** — large prompts/responses increase span payload size
- **Performance** — serializing large strings adds overhead

To disable recording:

```ts
experimental_telemetry: {
  isEnabled: true,
  functionId: "orchestrator-agent",
  recordInputs: false,   // don't record prompt/messages
  recordOutputs: false,  // don't record generated text
},
```

---

## Production Considerations

### Use `BatchSpanProcessor`

`SimpleSpanProcessor` exports spans synchronously and one at a time — fine for development, but too slow for production. Switch to `BatchSpanProcessor`:

```ts
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ ... }),
  spanProcessor: new BatchSpanProcessor(
    new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
  ),
});
```

`BatchSpanProcessor` buffers spans in memory and flushes them in batches, dramatically reducing the overhead of telemetry on request latency.

### Persistent Jaeger Storage

The `jaegertracing/all-in-one` image uses in-memory storage — traces are lost when the container restarts. For production, configure Jaeger with a persistent backend:

- **Elasticsearch** — recommended for high-volume production use
- **Cassandra** — good for very high write throughput
- **Badger** — embedded key-value store, good for single-node setups

### Sampling

In high-traffic production systems, tracing every request is expensive. Configure a **sampler** to trace only a fraction of requests:

```ts
import { TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-node";

const sdk = new NodeSDK({
  sampler: new TraceIdRatioBasedSampler(0.1), // trace 10% of requests
  // ...
});
```

---

## Summary

| What we did | Why |
|-------------|-----|
| Installed OTel packages | Provides the SDK, exporter, and semantic conventions |
| Created `instrumentation.ts` | Next.js entry point — loads OTel before any routes run |
| Created `instrumentation.node.ts` | Configures the OTel SDK to export to Jaeger via OTLP/HTTP |
| Created `app/api/multi-agent-otel/route.ts` | Orchestrator with custom spans + context injection |
| Created `app/api/mcp/agents-otel/[transport]/route.ts` | Agents with custom spans + context extraction |
| Added `experimental_telemetry` to AI SDK calls | Enables span emission for each LLM call |
| Started Jaeger with Docker | Provides a local OTLP collector and trace visualization UI |

The result: every user request to the multi-agent system produces **one unified trace** in Jaeger — showing exactly which agents ran, how long each took, how many tokens were used, and what tools were called, all in a single waterfall view.

The Chapter 1 files (`app/api/multi-agent/route.ts` and `app/api/mcp/agents/[transport]/route.ts`) remain clean and free of OTel imports. Chapter 2 adds observability as a separate layer, keeping the concerns separated.

---

**Next Steps:**
- [Chapter 3: Evals for AI Agents](./chapter-03-evals.md)
