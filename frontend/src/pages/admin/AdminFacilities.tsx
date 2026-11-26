import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api";
import { errorMessage, type AdminFacility, type DeleteResult, type FacilityIn } from "@/lib/adminTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import MapPicker from "@/components/admin/MapPicker";
import { CategoryPill, PageHeader, commas, useConfirm } from "@/components/admin/AdminUi";
import { useGuidelines } from "@/components/admin/useGuidelines";

const TYPES = ["E-waste centre", "Recycling unit", "Scrap dealer", "Municipal collection point", "Composting unit", "Hazardous / medical drop-off", "Other"];

interface FormState {
  type: string;
  name: string;
  categories: string[];
  lat: string;
  lng: string;
  address: string;
  phone: string;
  hours: string;
  accepts: string;
  active: boolean;
}

const EMPTY: FormState = {
  type: "",
  name: "",
  categories: [],
  lat: "17.5323",
  lng: "73.5186",
  address: "",
  phone: "",
  hours: "",
  accepts: "",
  active: true,
};

const STATUS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active only" },
  { value: "inactive", label: "Inactive only" },
];

export default function AdminFacilities() {
  const g = useGuidelines();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<AdminFacility | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const params = new URLSearchParams({ q });
  if (category !== "all") params.set("category", category);
  if (status !== "all") params.set("status", status);

  const list = useQuery({
    queryKey: ["admin", "facilities", params.toString()],
    queryFn: () => apiGet<AdminFacility[]>(`/admin/facilities?${params.toString()}`),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["facilities"] }); // citizen map cache
  };

  const save = useMutation({
    mutationFn: (body: FacilityIn) =>
      editing ? apiPut<AdminFacility>(`/admin/facilities/${editing.id}`, body) : apiPost<AdminFacility>("/admin/facilities", body),
    onSuccess: () => {
      refresh();
      setOpen(false);
      toast.success(editing ? "Facility updated" : "Facility added");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save — check the fields")),
  });

  const toggle = useMutation({
    mutationFn: (f: AdminFacility) => apiPatch<AdminFacility>(`/admin/facilities/${f.id}/active`, { active: !f.active }),
    onSuccess: (f) => {
      refresh();
      toast.success(f.active ? `${f.name} is now visible to citizens` : `${f.name} is hidden from citizens`);
    },
    onError: () => toast.error("Could not change status"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<DeleteResult>(`/admin/facilities/${id}`),
    onSuccess: () => {
      refresh();
      toast.success("Facility deleted");
    },
    onError: () => toast.error("Could not delete"),
  });

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (f: AdminFacility) => {
    setEditing(f);
    setForm({
      type: f.type ?? "",
      name: f.name,
      categories: f.categories,
      lat: String(f.lat),
      lng: String(f.lng),
      address: f.address,
      phone: f.phone ?? "",
      hours: f.hours ?? "",
      accepts: f.accepts.join(", "),
      active: f.active,
    });
    setOpen(true);
  };

  const toggleCat = (key: string, on: boolean) =>
    set("categories", on ? [...form.categories, key] : form.categories.filter((c) => c !== key));

  const latNum = Number(form.lat);
  const lngNum = Number(form.lng);
  const valid = form.name.trim().length >= 2 && form.categories.length > 0 && Number.isFinite(latNum) && Number.isFinite(lngNum);

  return (
    <>
      <PageHeader
        title="Facilities & collection points"
        subtitle="Recycling centres, e-waste hubs, scrap dealers and drop-off points citizens see on the map."
        action={
          <Button onClick={openNew} data-testid="facilities-add-button">
            <Plus className="mr-1 h-4 w-4" aria-hidden /> Add facility
          </Button>
        }
      />

      <Card className="border-emerald-950/10">
        <CardContent className="flex flex-wrap items-center gap-3 pt-5">
          <form className="flex min-w-60 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQ(draft.trim()); }}>
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search name or address…" data-testid="admin-facilities-search-input" />
            <Button type="submit" data-testid="admin-facilities-search-button">
              <Search className="h-4 w-4" aria-hidden />
              <span className="sr-only">Search</span>
            </Button>
          </form>
          <Select value={category} onValueChange={(v: string) => setCategory(v)}>
            <SelectTrigger className="w-44" data-testid="admin-facilities-category-filter">
              <SelectValue>{(v: string) => (v === "all" ? "All categories" : g.label(v))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(g.data ?? []).map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v: string) => setStatus(v)}>
            <SelectTrigger className="w-40" data-testid="admin-facilities-status-filter">
              <SelectValue>{(v: string) => STATUS.find((s) => s.value === v)?.label ?? v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value} data-testid={`admin-facilities-status-${s.value}`}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-emerald-950/10">
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Accepts</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(list.data ?? []).map((f) => (
                <TableRow key={f.id} className={f.active ? "" : "opacity-60"} data-testid={`admin-facility-row-${f.id}`}>
                  <TableCell>
                    <p className="font-medium">{f.name}</p>
                    {f.type && <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{f.type}</p>}
                    <p className="max-w-64 truncate text-xs text-emerald-950/55">{f.address}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {f.categories.map((c) => <CategoryPill key={c} label={g.label(c)} color={g.color(c)} />)}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-emerald-950/70">
                    <p>{f.phone ?? "—"}</p>
                    <p className="max-w-44 truncate">{f.hours ?? ""}</p>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggle.mutate(f)}
                      disabled={toggle.isPending}
                      data-testid={`admin-facility-toggle-${f.id}`}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${
                        f.active ? "border-green-200 bg-green-100 text-green-800 hover:bg-green-200" : "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {f.active ? "Active" : "Inactive"}
                    </button>
                    <Badge variant="outline" className="ml-1.5 text-[10px]">{f.source}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button size="icon-sm" variant="ghost" aria-label={`Edit ${f.name}`} onClick={() => openEdit(f)} data-testid={`admin-facility-edit-${f.id}`}>
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${f.name}`}
                      onClick={() => confirm(`Delete "${f.name}" permanently? Tip: deactivate instead to hide it temporarily.`, () => remove.mutate(f.id))}
                      data-testid={`admin-facility-delete-${f.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {list.data && list.data.length === 0 && (
            <p className="py-6 text-center text-sm text-emerald-950/60" data-testid="admin-facilities-empty">No facilities match these filters.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" data-testid="facility-form-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">{editing ? `Edit ${editing.name}` : "Add a facility in Chiplun"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fac-name">Name</Label>
              <Input id="fac-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Pethmap Ward Dry Waste Centre" data-testid="facility-name-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Type of place</Label>
              <Select value={form.type || "none"} onValueChange={(v: string) => set("type", v === "none" ? "" : v)}>
                <SelectTrigger className="w-full" data-testid="facility-type-select">
                  <SelectValue>{(v: string) => (v === "none" ? "Choose a type" : v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose a type</SelectItem>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Waste categories accepted</Label>
              <div className="flex flex-wrap gap-3">
                {(g.data ?? []).map((c) => (
                  <label key={c.key} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={form.categories.includes(c.key)}
                      onCheckedChange={(on: boolean) => toggleCat(c.key, on)}
                      data-testid={`facility-category-${c.key}`}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fac-lat">Latitude</Label>
              <Input id="fac-lat" inputMode="decimal" value={form.lat} onChange={(e) => set("lat", e.target.value)} data-testid="facility-lat-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fac-lng">Longitude</Label>
              <Input id="fac-lng" inputMode="decimal" value={form.lng} onChange={(e) => set("lng", e.target.value)} data-testid="facility-lng-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <p className="text-xs text-emerald-950/55">Click on the map to set the exact location (or type the numbers above).</p>
              {open && <MapPicker lat={latNum} lng={lngNum} onPick={(la, ln) => setForm((f) => ({ ...f, lat: String(la), lng: String(ln) }))} />}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fac-address">Address</Label>
              <Input id="fac-address" value={form.address} onChange={(e) => set("address", e.target.value)} data-testid="facility-address-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fac-phone">Phone</Label>
              <Input id="fac-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="facility-phone-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fac-hours">Opening hours</Label>
              <Input id="fac-hours" value={form.hours} onChange={(e) => set("hours", e.target.value)} placeholder="9 AM - 6 PM (Mon-Sat)" data-testid="facility-hours-input" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="fac-accepts">Items accepted (comma separated)</Label>
              <Input id="fac-accepts" value={form.accepts} onChange={(e) => set("accepts", e.target.value)} data-testid="facility-accepts-input" />
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox checked={form.active} onCheckedChange={(c: boolean) => set("active", c)} data-testid="facility-active-checkbox" />
              Active — visible on the citizen map and to the AI assistant
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="facility-cancel-button">Cancel</Button>
            <Button
              disabled={!valid || save.isPending}
              onClick={() =>
                save.mutate({
                  name: form.name.trim(),
                  categories: form.categories,
                  lat: latNum,
                  lng: lngNum,
                  address: form.address.trim(),
                  phone: form.phone.trim() || null,
                  hours: form.hours.trim() || null,
                  accepts: commas(form.accepts),
                  active: form.active,
                  type: form.type,
                })
              }
              data-testid="facility-save-button"
            >
              {save.isPending ? "Saving…" : "Save facility"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
