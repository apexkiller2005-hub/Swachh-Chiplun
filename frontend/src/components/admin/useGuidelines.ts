import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api";
import type { Guideline } from "@/lib/adminTypes";

// Admin-managed categories (key -> name/color) shared by the admin pages.
export function useGuidelines() {
  const query = useQuery({
    queryKey: ["admin", "guidelines"],
    queryFn: () => apiGet<Guideline[]>("/admin/guidelines"),
    staleTime: 30_000,
  });
  const byKey: Record<string, Guideline> = {};
  for (const g of query.data ?? []) byKey[g.key] = g;
  const label = (key: string) => byKey[key]?.name ?? key;
  const color = (key: string) => byKey[key]?.color ?? "#64748B";
  return { ...query, byKey, label, color };
}
