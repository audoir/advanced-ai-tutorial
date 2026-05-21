import { z } from "zod";
import { getDb } from "@/lib/db";

// ── Shared SQL input schema ───────────────────────────────────────────────────
export const sqlInputSchema = z.object({
  sql: z
    .string()
    .describe("A valid SQLite SELECT, INSERT, or UPDATE statement."),
  params: z
    .array(z.union([z.string(), z.number(), z.null()]))
    .optional()
    .describe(
      "Positional parameter values that replace '?' placeholders in the SQL statement.",
    ),
});

export type SqlInput = z.infer<typeof sqlInputSchema>;

// ── Shared execute factory ────────────────────────────────────────────────────
export function makeSqlExecute(toolName: string) {
  return async ({
    sql,
    params = [],
  }: {
    sql: string;
    params?: (string | number | null)[];
  }) => {
    const db = getDb();
    try {
      const normalised = sql.trim().toUpperCase();
      if (
        !normalised.startsWith("SELECT") &&
        !normalised.startsWith("INSERT") &&
        !normalised.startsWith("UPDATE")
      ) {
        throw new Error(
          "Only SELECT, INSERT, and UPDATE statements are allowed.",
        );
      }
      const stmt = db.prepare(sql);
      const result = normalised.startsWith("SELECT")
        ? (() => {
            const rows = stmt.all(...params);
            return { success: true, count: rows.length, rows };
          })()
        : (() => {
            const info = stmt.run(...params);
            return {
              success: true,
              insertedId: info.lastInsertRowid,
              changes: info.changes,
            };
          })();

      return result;
    } catch (err) {
      const result = { success: false, error: String(err) };
      return result;
    }
  };
}

// ── MCP-style execute factory (returns MCP content format) ───────────────────
export function makeMcpSqlExecute(toolName: string) {
  const execute = makeSqlExecute(toolName);
  return async ({
    sql,
    params = [],
  }: {
    sql: string;
    params?: (string | number | null)[];
  }) => {
    const result = await execute({ sql, params });
    if (!result.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { tool: toolName, success: false, error: (result as { error: string }).error },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ tool: toolName, ...result }, null, 2),
        },
      ],
    };
  };
}

// ── Shared tool descriptions ──────────────────────────────────────────────────
export const TOOL_DESCRIPTIONS = {
  inventory:
    "Run a SELECT, INSERT, or UPDATE SQL statement against the inventory table (columns: id, product_name, category, unit_price, stock_quantity, supplier, created_at). Use SELECT to query data, INSERT to add a new product, or UPDATE to modify existing products.",
  customers:
    "Run a SELECT, INSERT, or UPDATE SQL statement against the customers table (columns: id, first_name, last_name, email, city, joined_date). Use SELECT to query data, INSERT to add a new customer, or UPDATE to modify existing customers.",
  sales:
    "Run a SELECT, INSERT, or UPDATE SQL statement against the sales table (columns: id, inventory_id, customer_id, quantity_sold, sale_price, sale_date). JOINs with inventory and customers are allowed in SELECT. Use INSERT to record a new sale or UPDATE to modify existing sales.",
};
