import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage, type DeleteResult, type Tip, type TipIn } from "@/lib/adminTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CategoryPill, PageHeader, useConfirm } from "@/components/admin/AdminUi";
import { useGuidelines } from "@/components/admin/useGuidelines";

const EMPTY: TipIn = { title: "", body: "", category: "", active: true };

export default function AdminTips() {
  const g = useGuidelines();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Tip | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TipIn>(EMPTY);

  const tips = useQuery({ queryKey: ["admin", "tips"], queryFn: () => apiGet<Tip[]>("/admin/tips") });

  const save = useMutation({
    mutationFn: (body: TipIn) => (editing ? apiPut<Tip>(`/admin/tips/${editing.id}`, body) : apiPost<Tip>("/admin/tips", body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setOpen(false);
      toast.success(editing ? "Tip updated" : "Tip added");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save — check the fields")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<DeleteResult>(`/admin/tips/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Tip deleted");
    },
    onError: () => toast.error("Could not delete"),
  });

  return (
    <>
      <PageHeader
        title="Disposal tips & knowledge"
        subtitle="Short tips the AI assistant uses when answering citizens' questions."
        action={
          <Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="tips-add-button">
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Add tip
          </Button>
        }
      />
      {tips.data?.length === 0 && (
        <Card className="border-dashed border-emerald-950/15">
          <CardContent className="py-10 text-center text-sm text-emerald-950/60" data-testid="tips-empty">
            No tips yet. Add local knowledge, e.g. "Ward-wise dry waste is collected every Wednesday".
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {(tips.data ?? []).map((t) => (
          <Card key={t.id} className="border-emerald-950/10" data-testid={`tip-card-${t.id}`}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading font-bold text-emerald-950">{t.title}</h3>
                  {t.category && <CategoryPill label={g.label(t.category)} color={g.color(t.category)} />}
                  {!t.active && <Badge variant="outline">Hidden</Badge>}
                </div>
                <div className="flex shrink-0">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${t.title}`} onClick={() => { setEditing(t); setForm({ title: t.title, body: t.body, category: t.category, active: t.active }); setOpen(true); }} data-testid={`tip-edit-${t.id}`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${t.title}`} onClick={() => confirm(`Delete the tip "${t.title}"?`, () => remove.mutate(t.id))} data-testid={`tip-delete-${t.id}`}>
                    <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                  </Button>
                </div>
              </div>
              <p className="whitespace-pre-line text-sm text-emerald-950/75">{t.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="tip-form-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? "Edit tip" : "Add a disposal tip"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tip-title">Title</Label>
              <Input id="tip-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="tip-title-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tip-body">Tip</Label>
              <Textarea id="tip-body" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="tip-body-input" />
            </div>
            <Select value={form.category || "none"} onValueChange={(v: string) => setForm({ ...form, category: v === "none" ? "" : v })}>
              <SelectTrigger className="w-full" data-testid="tip-category-select">
                <SelectValue>{(v: string) => (v === "none" ? "Any category" : g.label(v))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any category</SelectItem>
                {(g.data ?? []).map((c) => <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.active} onCheckedChange={(c: boolean) => setForm({ ...form, active: c })} data-testid="tip-active-checkbox" />
              Active — the assistant may use this tip
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="tip-cancel-button">Cancel</Button>
            <Button disabled={save.isPending || form.title.trim().length < 2 || form.body.trim().length < 2} onClick={() => save.mutate({ ...form, title: form.title.trim(), body: form.body.trim() })} data-testid="tip-save-button">
              {save.isPending ? "Saving…" : "Save tip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
