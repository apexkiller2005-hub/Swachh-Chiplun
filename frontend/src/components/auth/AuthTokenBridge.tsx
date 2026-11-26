import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";

import { setAuthTokenGetter } from "@/lib/api";

// Hands Clerk's session token to the typed fetch layer, and drops cached data when
// the signed-in person changes (so one citizen never sees another's cached scans).
export default function AuthTokenBridge() {
  const { getToken, userId } = useAuth();
  const qc = useQueryClient();
  const previous = useRef<string | null | undefined>(userId);

  setAuthTokenGetter(() => getToken());

  useEffect(() => {
    if (previous.current !== userId) {
      qc.clear();
      previous.current = userId;
    }
  }, [userId, qc]);

  return null;
}
