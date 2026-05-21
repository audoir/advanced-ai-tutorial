import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = getDb();

    const inventory = db.prepare("SELECT * FROM inventory ORDER BY id").all();
    const customers = db.prepare("SELECT * FROM customers ORDER BY id").all();
    const sales = db
      .prepare(
        `SELECT
          s.id,
          s.inventory_id,
          i.product_name,
          s.customer_id,
          c.first_name || ' ' || c.last_name AS customer_name,
          s.quantity_sold,
          s.sale_price,
          s.sale_date
        FROM sales s
        JOIN inventory i ON s.inventory_id = i.id
        JOIN customers c ON s.customer_id = c.id
        ORDER BY s.id`
      )
      .all();

    return NextResponse.json({ inventory, customers, sales });
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json(
      { error: "Failed to fetch database contents" },
      { status: 500 }
    );
  }
}
