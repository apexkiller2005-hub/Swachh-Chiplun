import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";

import { apiGet } from "@/lib/api";
import type { Me } from "@/lib/adminTypes";

// The signed-in person's role. UI hint only — the server checks the role on every call.
export function useMe() {
  const { isSignedIn } = useAuth();
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<Me>("/me"),
    enabled: !!isSignedIn,
    staleTime: 60_000,
  });
}
