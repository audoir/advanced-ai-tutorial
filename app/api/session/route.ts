import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const db = getDb();
  const sessionId = randomUUID();
  db.prepare("INSERT INTO chat_sessions (id) VALUES (?)").run(sessionId);
  return NextResponse.json({ sessionId });
}
