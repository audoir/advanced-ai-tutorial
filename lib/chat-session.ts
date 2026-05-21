import type Database from "better-sqlite3";

export function initChatSession(
  db: Database.Database,
  sessionId: string,
  prompt?: string
): { role: "user" | "assistant"; content: string }[] {
  const existingSession = db
    .prepare("SELECT id FROM chat_sessions WHERE id = ?")
    .get(sessionId);

  if (!existingSession) {
    db.prepare("INSERT INTO chat_sessions (id) VALUES (?)").run(sessionId);
  }

  if (prompt) {
    db.prepare(
      "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)"
    ).run(sessionId, "user", prompt);
  }

  const history = db
    .prepare(
      "SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC"
    )
    .all(sessionId) as { role: string; content: string }[];

  return history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}

export function saveAssistantMessage(
  db: Database.Database,
  sessionId: string,
  text: string
): void {
  if (!text) return;

  db.prepare(
    "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)"
  ).run(sessionId, "assistant", text);

  db.prepare(
    "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?"
  ).run(sessionId);
}
