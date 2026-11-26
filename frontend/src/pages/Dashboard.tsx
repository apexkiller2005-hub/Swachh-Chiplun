import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Leaf, ScanLine, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { format } from "date-fns";

import { apiDelete, apiGet } from "@/lib/api";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  asCategory,
  type Classification,
  type ScanDeleteResponse,
  type Stats,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Dashboard() {
  const qc = useQueryClient();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/stats") });
  const scans = useQuery({
    queryKey: ["scans"],
    queryFn: () => apiGet<Classification[]>("/scans?limit=50"),
  });

  const removeScan = useMutation({
    mutationFn: (id: string) => apiDelete<ScanDeleteResponse>(`/scans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scans"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success("Scan deleted");
    },
    onError: () => toast.error("Could not delete the scan"),
  });

  const byCategory = stats.data?.by_category ?? {};
  const pieData = CATEGORY_ORDER.filter((c) => (byCategory[c] ?? 0) > 0).map((c) => ({
    name: CATEGORY_META[c].label,
    value: byCategory[c],
    hex: CATEGORY_META[c].hex,
  }));
  const topCategory =
    pieData.length > 0 ? pieData.reduce((a, b) => (a.value >= b.value ? a : b)).name : "—";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm" className="border-emerald-950/10" data-testid="dashboard-stat-scans">
          <CardContent className="pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700">
              <ScanLine className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 font-heading text-3xl font-bold text-emerald-950">
              {stats.data?.total_scans ?? "—"}
            </p>
            <p className="text-sm text-emerald-950/60">Items scanned</p>
          </CardContent>
        </Card>
        <Card size="sm" className="border-emerald-950/10" data-testid="dashboard-stat-points">
          <CardContent className="pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <Trophy className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 font-heading text-3xl font-bold text-emerald-950">
              {stats.data?.eco_points ?? "—"}
            </p>
            <p className="text-sm text-emerald-950/60">Eco points earned</p>
          </CardContent>
        </Card>
        <Card size="sm" className="border-emerald-950/10" data-testid="dashboard-stat-top">
          <CardContent className="pt-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700/10 text-emerald-700">
              <Leaf className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-3 font-heading text-2xl font-bold text-emerald-950" data-testid="dashboard-top-category">
              {topCategory}
            </p>
            <p className="text-sm text-emerald-950/60">Most scanned category</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="border-emerald-950/10 lg:col-span-2">
          <CardContent className="pt-5">
            <h2 className="font-heading text-base font-bold tracking-tight text-emerald-950">
              Waste composition
            </h2>
            {pieData.length === 0 ? (
              <div className="mt-6 text-center" data-testid="dashboard-empty">
                <p className="text-sm text-emerald-950/60">No scans yet.</p>
                <Button className="mt-3" render={<Link to="/scan" />} data-testid="dashboard-empty-cta">
                  Scan your first item
                </Button>
              </div>
            ) : (
              <div className="mt-2 h-72" data-testid="dashboard-pie-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.hex} stroke="#fff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [`${value} scans`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-emerald-950/10 lg:col-span-3" data-testid="dashboard-history">
          <CardContent className="pt-5">
            <h2 className="font-heading text-base font-bold tracking-tight text-emerald-950">
              Scan history
            </h2>
            {scans.data && scans.data.length > 0 ? (
              <div className="mt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Points</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead aria-label="Actions" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scans.data.map((scan) => (
                      <TableRow key={scan.id} data-testid={`dashboard-row-${scan.id}`}>
                        <TableCell className="font-medium">{scan.item_name}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              CATEGORY_META[asCategory(scan.category)].pill
                            }`}
                          >
                            {scan.category_label || CATEGORY_META[asCategory(scan.category)].label}
                          </span>
                        </TableCell>
                        <TableCell>{Math.round(scan.confidence * 100)}%</TableCell>
                        <TableCell>+{scan.eco_points}</TableCell>
                        <TableCell className="whitespace-nowrap text-emerald-950/60">
                          {format(new Date(scan.created_at), "dd MMM, HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Delete scan ${scan.item_name}`}
                            data-testid={`scan-delete-${scan.id}`}
                            onClick={() => removeScan.mutate(scan.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="mt-6 text-center text-sm text-emerald-950/60" data-testid="dashboard-history-empty">
                {scans.isLoading ? "Loading history…" : "Scans you make will be listed here."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}