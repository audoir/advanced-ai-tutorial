"use client";

import { useCallback, useEffect, useState } from "react";

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  const createSession = useCallback(() => {
    setSessionId(null);
    fetch("/api/session", { method: "POST" })
      .then((res) => res.json())
      .then((data: { sessionId: string }) => setSessionId(data.sessionId))
      .catch(() => {
        setSessionId(`session_${Date.now()}_fallback`);
      });
  }, []);

  useEffect(() => {
    createSession();
  }, [createSession]);

  return { sessionId, resetSession: createSession };
}
