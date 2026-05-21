import { createMcpHandler } from "mcp-handler";
import { makeMcpSqlExecute, TOOL_DESCRIPTIONS, sqlInputSchema } from "@/lib/sql-tools";

export const runtime = "nodejs";

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

      server.registerTool(
        "customers",
        {
          title: "Customers Table",
          description: TOOL_DESCRIPTIONS.customers,
          inputSchema: sqlInputSchema.shape,
        },
        makeMcpSqlExecute("customers"),
      );

      server.registerTool(
        "sales",
        {
          title: "Sales Table",
          description: TOOL_DESCRIPTIONS.sales,
          inputSchema: sqlInputSchema.shape,
        },
        makeMcpSqlExecute("sales"),
      );
    },
    {},
    {
      basePath: "/api/mcp/database",
      maxDuration: 60,
      verboseLogs: true,
    },
  );
}

export async function GET(request: Request) {
  return makeHandler(request)(request);
}

export async function POST(request: Request) {
  return makeHandler(request)(request);
}
