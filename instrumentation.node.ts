import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// ─── OpenTelemetry Setup ──────────────────────────────────────────────────────
//
// Sends traces to Jaeger (or any OTLP-compatible collector) via HTTP.
//
// Jaeger all-in-one listens on:
//   - http://localhost:4318  (OTLP/HTTP — used here)
//   - http://localhost:4317  (OTLP/gRPC)
//
// Start Jaeger with:
//   docker run --rm --name jaeger \
//     -p 16686:16686 \
//     -p 4317:4317 \
//     -p 4318:4318 \
//     jaegertracing/all-in-one:1.76.0
//
// Then open http://localhost:16686 to view traces.
// ─────────────────────────────────────────────────────────────────────────────

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
