import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiPost, apiPut } from "@/lib/api";
import { errorMessage, type DeleteResult, type Guideline, type GuidelineIn } from "@/lib/adminTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryPill, PageHeader, commas, lines, useConfirm } from "@/components/admin/AdminUi";
import { useGuidelines } from "@/components/admin/useGuidelines";

interface FormState {
  key: string;
  name: string;
  description: string;
  examples: string;
  disposal_steps: string;
  hazards: string;
  eco_points: string;
  color: string;
  active: boolean;
}

const EMPTY: FormState = {
  key: "",
  name: "",
  description: "",
  examples: "",
  disposal_steps: "",
  hazards: "",
  eco_points: "10",
  color: "#0EA5E9",
  active: true,
};

function toForm(g: Guideline): FormState {
  return {
    key: g.key,
    name: g.name,
    description: g.description,
    examples: g.examples.join(", "),
    disposal_steps: g.disposal_steps.join("\n"),
    hazards: g.hazards.join("\n"),
    eco_points: String(g.eco_points),
    color: g.color,
    active: g.active,
  };
}

export default function AdminGuidelines() {
  const g = useGuidelines();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Guideline | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    setOpen(false);
    toast.success(msg);
  };

  const save = useMutation({
    mutationFn: (body: GuidelineIn) =>
      editing ? apiPut<Guideline>(`/admin/guidelines/${editing.id}`, body) : apiPost<Guideline>("/admin/guidelines", body),
    onSuccess: () => done(editing ? "Category updated" : "Category added"),
    onError: (e) => toast.error(errorMessage(e, "Could not save — check the fields")),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<DeleteResult>(`/admin/guidelines/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Category deleted");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not delete")),
  });

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (item: Guideline) => {
    setEditing(item);
    setForm(toForm(item));
    setOpen(true);
  };

  const submit = () => {
    save.mutate({
      key: form.key.trim().toLowerCase(),
      name: form.name.trim(),
      description: form.description.trim(),
      examples: commas(form.examples),
      disposal_steps: lines(form.disposal_steps),
      hazards: lines(form.hazards),
      eco_points: Number(form.eco_points) || 0,
      color: form.color,
      active: form.active,
    });
  };

  return (
    <>
      <PageHeader
        title="Waste categories & disposal guidelines"
        subtitle="What you write here is used by the AI when citizens scan items and ask the assistant."
        action={
          <Button onClick={openNew} data-testid="categories-add-button">
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Add category
          </Button>
        }
      />

      {g.isLoading && <p className="text-sm text-emerald-950/60">Loading…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {(g.data ?? []).map((item) => (
          <Card key={item.id} className="border-emerald-950/10" data-testid={`category-card-${item.key}`}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryPill label={item.name} color={item.color} />
                  <code className="text-xs text-emerald-950/50">{item.key}</code>
                  {item.active ? (
                    <Badge variant="secondary" data-testid={`category-status-${item.key}`}>Active</Badge>
                  ) : (
                    <Badge variant="outline" data-testid={`category-status-${item.key}`}>Hidden</Badge>
                  )}
                </div>
                <div className="flex shrink-0">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)} data-testid={`category-edit-${item.key}`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  {item.key !== "general" && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => confirm(`Delete the category "${item.name}"? Past records keep their label.`, () => remove.mutate(item.id))}
                      data-testid={`category-delete-${item.key}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-sm text-emerald-950/75">{item.description}</p>
              {item.disposal_steps.length > 0 && (
                <ol className="list-decimal space-y-0.5 pl-5 text-sm text-emerald-950/80">
                  {item.disposal_steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-950/55">
                <span data-testid={`category-points-${item.key}`}>+{item.eco_points} eco points</span>
                <span>{item.scan_count} scans</span>
                <span>{item.facility_count} facilities</span>
                {item.examples.length > 0 && <span>e.g. {item.examples.slice(0, 3).join(", ")}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="category-form-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? `Edit ${editing.name}` : "Add a waste category"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Textile" data-testid="category-name-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-key">Key (lowercase, fixed)</Label>
              <Input
                id="cat-key"
                value={form.key}
                disabled={!!editing}
                onChange={(e) => set("key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder="textile"
                data-testid="category-key-input"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-desc">Description (what belongs here)</Label>
              <Textarea id="cat-desc" rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} data-testid="category-description-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-examples">Examples (comma separated)</Label>
              <Input id="cat-examples" value={form.examples} onChange={(e) => set("examples", e.target.value)} placeholder="Old clothes, bedsheets, shoes" data-testid="category-examples-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-steps">Disposal steps (one per line)</Label>
              <Textarea id="cat-steps" rows={4} value={form.disposal_steps} onChange={(e) => set("disposal_steps", e.target.value)} data-testid="category-steps-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="cat-hazards">Hazards (one per line, optional)</Label>
              <Textarea id="cat-hazards" rows={2} value={form.hazards} onChange={(e) => set("hazards", e.target.value)} data-testid="category-hazards-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-points">Eco points per scan</Label>
              <Input id="cat-points" type="number" min={0} max={100} value={form.eco_points} onChange={(e) => set("eco_points", e.target.value)} data-testid="category-points-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-color">Colour</Label>
              <Input id="cat-color" type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="h-9 p-1" data-testid="category-color-input" />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={form.active} onCheckedChange={(c: boolean) => set("active", c)} data-testid="category-active-checkbox" />
              Active — the AI may classify items into this category
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="category-cancel-button">Cancel</Button>
            <Button onClick={submit} disabled={save.isPending || form.name.trim().length < 2 || form.key.trim().length < 2} data-testid="category-save-button">
              {save.isPending ? "Saving…" : "Save category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
