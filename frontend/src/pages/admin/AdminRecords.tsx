import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, Eye, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet } from "@/lib/api";
import type { AdminScan, DeleteResult, ScanPage } from "@/lib/adminTypes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryPill, PageHeader, useConfirm } from "@/components/admin/AdminUi";
import { useGuidelines } from "@/components/admin/useGuidelines";

const PERIODS = [
  { value: "0", label: "All time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

function toCsv(rows: AdminScan[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["date", "item", "category", "confidence", "eco_points", "user", "language", "hint"];
  const body = rows.map((r) =>
    [r.created_at, r.item_name, r.category, r.confidence.toFixed(2), r.eco_points, r.user_email, r.language, r.hint].map(esc).join(","),
  );
  return [head.join(","), ...body].join("\n");
}

export default function AdminRecords() {
  const [params, setParams] = useSearchParams();
  const userFilter = params.get("user") ?? "";
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [days, setDays] = useState("0");
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<AdminScan | null>(null);
  const g = useGuidelines();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const query = new URLSearchParams({ q, page: String(page), page_size: "25", days });
  if (category !== "all") query.set("category", category);
  if (lowOnly) query.set("low_confidence", "true");
  if (userFilter) query.set("user_id", userFilter);

  const records = useQuery({
    queryKey: ["admin", "scans", query.toString()],
    queryFn: () => apiGet<ScanPage>(`/admin/scans?${query.toString()}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<DeleteResult>(`/admin/scans/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Record deleted");
    },
    onError: () => toast.error("Could not delete the record"),
  });

  const total = records.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));

  const exportCsv = async () => {
    // export ALL records matching the current filters (up to 200 per file)
    const all = new URLSearchParams(query);
    all.set("page", "1");
    all.set("page_size", "200");
    const rows = (await apiGet<ScanPage>(`/admin/scans?${all.toString()}`)).items;
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "swachh-chiplun-records.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Waste identification records"
        subtitle="Every scan made by citizens — search, filter, inspect or remove."
        action={
          <Button variant="outline" onClick={exportCsv} disabled={!records.data?.items.length} data-testid="records-export-csv-button">
            <Download className="mr-1 h-4 w-4" aria-hidden /> Export CSV
          </Button>
        }
      />

      <Card className="border-emerald-950/10">
        <CardContent className="flex flex-wrap items-center gap-3 pt-5">
          <form
            className="flex min-w-60 flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(draft.trim());
              setPage(1);
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search item name or hint…" data-testid="records-search-input" />
            <Button type="submit" data-testid="records-search-button">
              <Search className="h-4 w-4" aria-hidden />
              <span className="sr-only">Search</span>
            </Button>
          </form>
          <Select value={category} onValueChange={(v: string) => { setCategory(v); setPage(1); }}>
            <SelectTrigger className="w-44" data-testid="records-category-filter">
              <SelectValue>{(v: string) => (v === "all" ? "All categories" : g.label(v))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="records-category-all">All categories</SelectItem>
              {(g.data ?? []).map((c) => (
                <SelectItem key={c.key} value={c.key} data-testid={`records-category-${c.key}`}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={(v: string) => { setDays(v); setPage(1); }}>
            <SelectTrigger className="w-40" data-testid="records-period-filter">
              <SelectValue>{(v: string) => PERIODS.find((p) => p.value === v)?.label ?? v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value} data-testid={`records-period-${p.value}`}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-emerald-950/80">
            <Checkbox checked={lowOnly} onCheckedChange={(c: boolean) => { setLowOnly(c); setPage(1); }} data-testid="records-low-confidence-filter" />
            Low confidence only
          </label>
          {userFilter && (
            <Button variant="ghost" size="sm" onClick={() => setParams({})} data-testid="records-clear-user-filter">
              Showing one user · clear
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-emerald-950/10">
        <CardContent className="pt-5">
          <p className="mb-3 text-sm text-emerald-950/60" data-testid="records-total">
            {records.isLoading ? "Loading…" : `${total} record${total === 1 ? "" : "s"} found`}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>User</TableHead>
                <TableHead>When</TableHead>
                <TableHead aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(records.data?.items ?? []).map((r) => (
                <TableRow key={r.id} data-testid={`records-row-${r.id}`}>
                  <TableCell className="font-medium">{r.item_name}</TableCell>
                  <TableCell>
                    <CategoryPill label={r.category_label || g.label(r.category)} color={g.color(r.category)} />
                  </TableCell>
                  <TableCell className={r.confidence < 0.65 ? "font-semibold text-amber-700" : ""}>{Math.round(r.confidence * 100)}%</TableCell>
                  <TableCell className="max-w-48 truncate text-emerald-950/70">{r.user_email || "demo (before sign-in)"}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-950/60">{format(new Date(r.created_at), "dd MMM yyyy, HH:mm")}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon-sm" variant="ghost" onClick={() => setViewing(r)} aria-label="View record" data-testid={`records-view-${r.id}`}>
                      <Eye className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete record"
                      onClick={() => confirm(`Delete the record "${r.item_name}"? This cannot be undone.`, () => remove.mutate(r.id))}
                      data-testid={`records-delete-${r.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {records.data && records.data.items.length === 0 && (
            <p className="py-6 text-center text-sm text-emerald-950/60" data-testid="records-empty">No records match these filters.</p>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="records-prev-page">
              Previous
            </Button>
            <span className="text-sm text-emerald-950/60" data-testid="records-page-indicator">Page {page} of {pages}</span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="records-next-page">
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={viewing !== null} onOpenChange={(o: boolean) => !o && setViewing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="records-detail-dialog">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{viewing.item_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <CategoryPill label={viewing.category_label || g.label(viewing.category)} color={g.color(viewing.category)} />
                  <span className="text-emerald-950/60">{Math.round(viewing.confidence * 100)}% confidence · +{viewing.eco_points} pts · {viewing.language.toUpperCase()}</span>
                </div>
                <p><span className="font-semibold">User:</span> {viewing.user_email || "demo (before sign-in)"}</p>
                {viewing.hint && <p><span className="font-semibold">Hint typed:</span> {viewing.hint}</p>}
                {viewing.hazards.length > 0 && (
                  <div>
                    <p className="font-semibold text-red-700">Hazards</p>
                    <ul className="list-disc pl-5">{viewing.hazards.map((h, i) => <li key={i}>{h}</li>)}</ul>
                  </div>
                )}
                <div>
                  <p className="font-semibold">Disposal steps given</p>
                  <ol className="list-decimal pl-5">{viewing.disposal_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                </div>
                {viewing.needs_follow_up && <p className="rounded-lg bg-amber-50 p-2 text-amber-800">Follow-up asked: {viewing.follow_up_question}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
