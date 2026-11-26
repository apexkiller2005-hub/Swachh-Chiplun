import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Gauge, MapPinned, Pause, Play, Plus, Route as RouteIcon, Square, Trash2, Truck, Undo2, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { CATEGORY_META, CATEGORY_ORDER, type Facility } from "@/lib/types";
import {
  ALERT_OPTIONS,
  STATUS_META,
  fmtDistance,
  type AdminDoorstepState,
  type AlertM,
  type DemoUser,
  type DemoUserIn,
  type LatLng,
  type OkResponse,
  type Pin,
  type Route,
  type RouteIn,
} from "@/lib/doorstepTypes";
import DoorstepMap, { type MapPin } from "@/components/doorstep/DoorstepMap";
import { PageHeader, useConfirm } from "@/components/admin/AdminUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tab = "route" | "users" | "sim" | "driver";
const TABS: { id: Tab; label: string; icon: typeof RouteIcon }[] = [
  { id: "route", label: "Route", icon: RouteIcon },
  { id: "users", label: "Demo users", icon: Users },
  { id: "sim", label: "Vehicle & live map", icon: Truck },
  { id: "driver", label: "Driver view", icon: Flag },
];
const STATE_KEY = ["doorstep-state"];
const ROUTES_KEY = ["doorstep-routes"];
const DEMO_KEY = ["doorstep-demo-users"];
const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");
const typeLabels = (t: string[]) => t.map((x) => CATEGORY_META[x as keyof typeof CATEGORY_META]?.label ?? x).join(", ");
const selectCls = "h-9 w-full rounded-lg border border-input bg-white px-3 text-sm";

export default function AdminDoorstep() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("sim");

  const routes = useQuery({ queryKey: ROUTES_KEY, queryFn: () => apiGet<Route[]>("/admin/doorstep/routes") });
  const demoUsers = useQuery({ queryKey: DEMO_KEY, queryFn: () => apiGet<DemoUser[]>("/admin/doorstep/demo-users") });
  const facilities = useQuery({ queryKey: ["admin-facilities-doorstep"], queryFn: () => apiGet<Facility[]>("/admin/facilities") });
  const state = useQuery({ queryKey: STATE_KEY, queryFn: () => apiGet<AdminDoorstepState>("/admin/doorstep/state"), refetchInterval: 3000 });
  const live = state.data;
  const running = !!live?.vehicle;

  const [routeId, setRouteId] = useState<string>("");
  const selectedRoute = routes.data?.find((r) => r.id === (routeId || live?.route_id)) ?? routes.data?.[0] ?? null;
  const facility = facilities.data?.find((f) => f.id === selectedRoute?.facility_id) ?? null;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: STATE_KEY });
    void qc.invalidateQueries({ queryKey: DEMO_KEY });
    void qc.invalidateQueries({ queryKey: ROUTES_KEY });
  };
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (e) => toast.error(errText(e)),
  });
  const run = (fn: () => Promise<unknown>, ok?: string) => act.mutate(fn, { onSuccess: () => ok && toast.success(ok) });

  // ---------------------------------------------------------------- route tool
  const [draft, setDraft] = useState<LatLng[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rName, setRName] = useState("");
  const [rWindow, setRWindow] = useState("07:00 – 09:00");
  const [rFacility, setRFacility] = useState("");
  const startDraft = (r?: Route) => {
    setEditingId(r?.id ?? null);
    setDraft(r ? [...r.points] : []);
    setRName(r?.name ?? "");
    setRWindow(r?.time_window ?? "07:00 – 09:00");
    setRFacility(r?.facility_id ?? "");
    setTab("route");
  };
  const saveRoute = () => {
    if (!draft || draft.length < 2) return toast.error("Click at least a start and an end point on the map");
    if (!rName.trim()) return toast.error("Give the route a name");
    const body: RouteIn = { name: rName.trim(), points: draft, time_window: rWindow, facility_id: rFacility || null };
    run(async () => {
      const saved = editingId ? await apiPut<Route>(`/admin/doorstep/routes/${editingId}`, body) : await apiPost<Route>("/admin/doorstep/routes", body);
      setRouteId(saved.id);
      setDraft(null);
      setEditingId(null);
    }, "Route saved");
  };

  // ---------------------------------------------------------------- demo users
  const [addMode, setAddMode] = useState(false);
  const [newAlert, setNewAlert] = useState<AlertM>(500);
  const [newTypes, setNewTypes] = useState<string[]>(["organic"]);
  const demoById = useMemo(() => new Map((demoUsers.data ?? []).map((d) => [d.id, d])), [demoUsers.data]);
  const demoBody = (d: DemoUser, p?: LatLng): DemoUserIn => ({
    name: d.name,
    label: d.label,
    lat: p?.lat ?? d.lat,
    lng: p?.lng ?? d.lng,
    alert_m: d.alert_m as AlertM,
    waste_types: d.waste_types,
    has_waste: d.has_waste,
  });

  // ---------------------------------------------------------------- simulation
  const [speed, setSpeed] = useState<1 | 5 | 10>(5);
  const [pickStart, setPickStart] = useState(false);
  const [customStart, setCustomStart] = useState<LatLng | null>(null);
  const [manual, setManual] = useState(false);
  const [selectedPin, setSelectedPin] = useState<string>("");
  const pins = live?.pins ?? [];
  const selPin = pins.find((p) => p.key === selectedPin) ?? null;

  const onMapClick = (p: LatLng) => {
    if (tab === "route" && draft) setDraft([...draft, p]);
    else if (tab === "users" && addMode)
      run(() => apiPost<DemoUser>("/admin/doorstep/demo-users", { name: "", label: "", lat: p.lat, lng: p.lng, alert_m: newAlert, waste_types: newTypes, has_waste: true }), "Demo user added");
    else if (tab === "sim" && pickStart) {
      setCustomStart(p);
      setPickStart(false);
      toast.message("Start point chosen — press Start");
    }
  };
  const onPinDrag = (key: string, p: LatLng) => {
    const d = demoById.get(key.replace(/^demo_/, ""));
    if (!key.startsWith("demo_") || !d) return;
    run(() => apiPut<DemoUser>(`/admin/doorstep/demo-users/${d.id}`, demoBody(d, p)), `${d.name} moved`);
  };

  const mapPins: MapPin[] = pins.map((p) => ({
    key: p.key,
    lat: p.lat,
    lng: p.lng,
    color: STATUS_META[p.status].hex,
    text: p.kind === "real" ? "R" : p.name.replace(/\D/g, ""),
    square: p.kind === "real",
    draggable: p.kind === "demo" && (tab === "users" || tab === "sim") && !manual,
    selected: p.key === selectedPin,
    tooltip: `${p.kind === "real" ? "Real user · " : ""}${p.name} — ${p.label} · ${STATUS_META[p.status].label} · alert ${fmtDistance(p.alert_m)}${
      p.eta_min ? ` · about ${p.eta_min} min` : ""
    }`,
  }));
  const counts = pins.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {});
  const routeLine = live?.vehicle?.path ?? selectedRoute?.points ?? null;

  return (
    <div className="space-y-5">
      {dialog}
      <PageHeader
        title="Doorstep Demo"
        subtitle="DEMO ONLY — simulated garbage vehicle. Demo users and demo trips never change the real dashboard numbers."
        action={
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800" data-testid="doorstep-demo-badge">
            Demo
          </span>
        }
      />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-emerald-950/10 bg-white p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            data-testid={`doorstep-tab-${t.id}`}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab === t.id ? "bg-[#0D1B13] text-white" : "text-emerald-950 hover:bg-emerald-50",
            )}
          >
            <t.icon className="h-4 w-4" aria-hidden /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* ------------------------------------------------ map (shared by all tabs) */}
        <div className="space-y-2">
          <DoorstepMap
            testid="doorstep-admin-map"
            route={tab === "route" && draft ? null : routeLine}
            draft={tab === "route" ? draft : null}
            vehicle={live?.vehicle ?? null}
            vehicleDraggable={manual && running}
            pins={mapPins}
            facility={facility ? { lat: facility.lat, lng: facility.lng, name: facility.name } : null}
            marker={customStart}
            onMapClick={onMapClick}
            onPinDrag={onPinDrag}
            onPinClick={(k) => setSelectedPin(k)}
            onVehicleDrag={(p) => run(() => apiPut<OkResponse>("/admin/doorstep/trip/position", p))}
            fitKey={`${selectedRoute?.id ?? ""}-${pins.length > 0}`}
            className="relative z-0 h-[380px] w-full overflow-hidden rounded-2xl border border-emerald-950/10 md:h-[520px]"
          />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid="doorstep-map-legend">
            {(Object.keys(STATUS_META) as (keyof typeof STATUS_META)[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full" style={{ background: STATUS_META[s].hex }} /> {STATUS_META[s].label} ({counts[s] ?? 0})
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px] border-2 border-violet-900 bg-slate-400" /> Real user (square, “R”)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-teal-700" /> Drop facility
            </span>
          </div>
          {tab === "route" && draft && (
            <p className="rounded-lg bg-violet-50 p-2 text-sm text-violet-900" data-testid="doorstep-route-hint">
              Click the map: first the <b>start</b>, then each <b>stop in order</b>, then the <b>end</b>. Points so far: {draft.length}
            </p>
          )}
          {tab === "users" && addMode && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900">Click the map to add a demo user there.</p>}
          {tab === "sim" && pickStart && <p className="rounded-lg bg-yellow-50 p-2 text-sm text-yellow-900">Click the map to choose the vehicle's start point.</p>}
        </div>

        {/* ------------------------------------------------ side panel */}
        <div className="space-y-4">
          {tab === "route" && (
            <Card className="border-emerald-950/10">
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => startDraft()} data-testid="doorstep-new-route-button">
                    <Plus className="h-4 w-4" /> New route
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => run(async () => setRouteId((await apiPost<Route>("/admin/doorstep/routes/sample")).id), "Sample route loaded")} data-testid="doorstep-load-sample-route-button">
                    <Wand2 className="h-4 w-4" /> Load sample route
                  </Button>
                </div>
                {draft && (
                  <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3" data-testid="doorstep-route-form">
                    <div className="space-y-1.5">
                      <Label htmlFor="r-name">Route name</Label>
                      <Input id="r-name" value={rName} onChange={(e) => setRName(e.target.value)} data-testid="doorstep-route-name-input" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="r-window">Time window</Label>
                      <Input id="r-window" value={rWindow} onChange={(e) => setRWindow(e.target.value)} data-testid="doorstep-route-window-input" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="r-fac">Drop facility</Label>
                      <select id="r-fac" className={selectCls} value={rFacility} onChange={(e) => setRFacility(e.target.value)} data-testid="doorstep-route-facility-select">
                        <option value="">— none —</option>
                        {facilities.data?.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={saveRoute} data-testid="doorstep-route-save-button">Save route</Button>
                      <Button size="sm" variant="outline" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))} data-testid="doorstep-route-undo-button">
                        <Undo2 className="h-4 w-4" /> Undo point
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setEditingId(null); }} data-testid="doorstep-route-cancel-button">Cancel</Button>
                    </div>
                  </div>
                )}
                <ul className="divide-y divide-emerald-950/5" data-testid="doorstep-routes-list">
                  {routes.data?.length === 0 && <li className="py-2 text-sm text-muted-foreground">No routes yet — load the sample route.</li>}
                  {routes.data?.map((r) => (
                    <li key={r.id} className={cn("flex items-start gap-2 py-2", selectedRoute?.id === r.id && "bg-emerald-50/60")} data-testid="doorstep-route-item">
                      <button className="min-w-0 flex-1 text-left" onClick={() => setRouteId(r.id)} data-testid="doorstep-route-select-button">
                        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                          {r.name}
                          {r.is_demo && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-800">Demo</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.points.length - 2} stops · {r.time_window || "no time window"} · drop: {r.facility_name || "none"}
                        </p>
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => startDraft(r)} data-testid="doorstep-route-edit-button">Edit</Button>
                      <Button size="sm" variant="ghost" aria-label="Delete route" onClick={() => confirm(`Delete route “${r.name}”?`, () => run(() => apiDelete<OkResponse>(`/admin/doorstep/routes/${r.id}`), "Route deleted"))} data-testid="doorstep-route-delete-button">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {tab === "users" && (
            <Card className="border-emerald-950/10">
              <CardContent className="space-y-3 pt-5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!selectedRoute}
                    onClick={() => selectedRoute && run(() => apiPost<DemoUser[]>("/admin/doorstep/demo-users/generate", { route_id: selectedRoute.id, count: 12 }), "12 demo users generated along the route")}
                    data-testid="doorstep-generate-demo-users-button"
                  >
                    <Wand2 className="h-4 w-4" /> Generate demo users along the route
                  </Button>
                  <Button size="sm" variant={addMode ? "default" : "outline"} onClick={() => setAddMode((v) => !v)} data-testid="doorstep-add-demo-user-toggle">
                    <MapPinned className="h-4 w-4" /> {addMode ? "Adding: click map" : "Add demo user"}
                  </Button>
                </div>
                {addMode && (
                  <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                    <select className={selectCls} value={newAlert} onChange={(e) => setNewAlert(Number(e.target.value) as AlertM)} data-testid="doorstep-new-demo-alert-select">
                      {ALERT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Alert at {o.label}</option>)}
                    </select>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_ORDER.map((c) => (
                        <button
                          key={c}
                          onClick={() => setNewTypes((t) => (t.includes(c) ? t.filter((x) => x !== c) : [...t, c]))}
                          className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", newTypes.includes(c) ? CATEGORY_META[c].pill : "border-slate-200 bg-white text-slate-500")}
                          data-testid={`doorstep-new-demo-type-${c}`}
                        >
                          {CATEGORY_META[c].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Drag any numbered demo pin on the map to move it. Demo users cannot log in and have no email or password.</p>
                <ul className="max-h-[420px] divide-y divide-emerald-950/5 overflow-y-auto" data-testid="doorstep-demo-users-list">
                  {demoUsers.data?.length === 0 && <li className="py-2 text-sm text-muted-foreground">No demo users yet.</li>}
                  {demoUsers.data?.map((d) => {
                    const st = pins.find((p) => p.key === `demo_${d.id}`)?.status ?? (d.has_waste ? "requested" : "waiting");
                    return (
                      <li key={d.id} className="flex items-center gap-2 py-2" data-testid="doorstep-demo-user-item">
                        <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedPin(`demo_${d.id}`)}>
                          <p className="text-sm font-semibold text-emerald-950">{d.name} <span className="font-normal text-muted-foreground">· {d.label}</span></p>
                          <p className="text-xs text-muted-foreground">
                            alert {fmtDistance(d.alert_m)} · {d.has_waste ? typeLabels(d.waste_types) : "no waste today"}
                          </p>
                        </button>
                        <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_META[st].pill)}>{STATUS_META[st].label}</span>
                        <Button size="sm" variant="ghost" aria-label={`Delete ${d.name}`} onClick={() => confirm(`Delete ${d.name}?`, () => run(() => apiDelete<OkResponse>(`/admin/doorstep/demo-users/${d.id}`), "Demo user deleted"))} data-testid="doorstep-demo-user-delete-button">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          {tab === "sim" && (
            <>
              <Card className="border-emerald-950/10">
                <CardContent className="space-y-3 pt-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="sim-route">Route</Label>
                    <select id="sim-route" className={selectCls} value={selectedRoute?.id ?? ""} onChange={(e) => setRouteId(e.target.value)} disabled={running} data-testid="doorstep-sim-route-select">
                      {routes.data?.length === 0 && <option value="">No routes — load the sample route first</option>}
                      {routes.data?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">Start:</span>
                    <Button size="sm" variant={!customStart ? "default" : "outline"} disabled={running} onClick={() => setCustomStart(null)} data-testid="doorstep-start-route-start-button">Route start</Button>
                    <Button size="sm" variant={pickStart || customStart ? "default" : "outline"} disabled={running} onClick={() => setPickStart(true)} data-testid="doorstep-start-pick-map-button">
                      Click on map
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Gauge className="h-4 w-4 text-emerald-800" aria-hidden />
                    <span className="font-medium">Speed:</span>
                    {([1, 5, 10] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setSpeed(s);
                          if (running) run(() => apiPut<OkResponse>("/admin/doorstep/trip/speed", { speed: s }));
                        }}
                        data-testid={`doorstep-speed-${s}x`}
                        className={cn("rounded-lg border px-3 py-1 font-semibold", (live?.vehicle?.speed ?? speed) === s ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-950/15 bg-white")}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Button
                      disabled={!selectedRoute || running}
                      onClick={() => selectedRoute && run(() => apiPost<OkResponse>("/admin/doorstep/trip/start", { route_id: selectedRoute.id, speed, start: customStart }), "Demo trip started")}
                      data-testid="doorstep-start-button"
                    >
                      <Play className="h-4 w-4" /> Start
                    </Button>
                    <Button variant="outline" disabled={!running || live?.vehicle?.state !== "running" || live?.vehicle?.mode === "manual"} onClick={() => run(() => apiPost<OkResponse>("/admin/doorstep/trip/pause"))} data-testid="doorstep-pause-button">
                      <Pause className="h-4 w-4" /> Pause
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!running || (live?.vehicle?.state === "running" && live?.vehicle?.mode === "auto")}
                      onClick={() => {
                        setManual(false);
                        run(() => apiPost<OkResponse>("/admin/doorstep/trip/resume"));
                      }}
                      data-testid="doorstep-resume-button"
                    >
                      <Play className="h-4 w-4" /> Resume
                    </Button>
                    <Button variant="destructive" disabled={!running} onClick={() => { setManual(false); run(() => apiPost<OkResponse>("/admin/doorstep/trip/stop"), "Trip stopped"); }} data-testid="doorstep-stop-button">
                      <Square className="h-4 w-4" /> Stop
                    </Button>
                  </div>
                  <div className="space-y-1.5 border-t border-emerald-950/10 pt-3">
                    <Label htmlFor="sel-user">Selected user (or click a pin)</Label>
                    <select id="sel-user" className={selectCls} value={selectedPin} onChange={(e) => setSelectedPin(e.target.value)} data-testid="doorstep-selected-user-select">
                      <option value="">— choose a user —</option>
                      {pins.map((p) => (
                        <option key={p.key} value={p.key}>{p.kind === "real" ? `Real user · ${p.name}` : p.name} — {STATUS_META[p.status].label}</option>
                      ))}
                    </select>
                    <Button variant="outline" className="w-full" disabled={!running || !selPin} onClick={() => selPin && run(() => apiPost<OkResponse>("/admin/doorstep/trip/place-near", { pin_key: selPin.key }), `Vehicle placed about 400 m from ${selPin.name}`)} data-testid="doorstep-place-near-button">
                      <MapPinned className="h-4 w-4" /> Place vehicle near selected user
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-700" checked={manual}
                      disabled={!running}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setManual(on);
                        const v = live?.vehicle;
                        // switch the server to manual right away: the vehicle stops where it is
                        if (on && v) run(() => apiPut<OkResponse>("/admin/doorstep/trip/position", { lat: v.lat, lng: v.lng }));
                        if (!on) run(() => apiPost<OkResponse>("/admin/doorstep/trip/resume"));
                      }} data-testid="doorstep-manual-mode-checkbox" />
                    Manual mode — drag the vehicle marker yourself (press Resume to go back to auto)
                  </label>
                  {running && (
                    <div data-testid="doorstep-progress">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <span>{live?.vehicle?.state === "paused" ? "Paused" : live?.vehicle?.mode === "manual" ? "Manual mode" : `Driving at ${live?.vehicle?.speed}x`}</span>
                        <span>{live?.progress_pct}% of route</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
                        <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-700" style={{ width: `${live?.progress_pct ?? 0}%` }} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {live?.summary && !running && <SummaryCard s={live.summary} />}
              <FeedCard feed={live?.feed ?? []} />
            </>
          )}

          {tab === "driver" && (
            <Card className="border-emerald-950/10">
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-base font-semibold text-emerald-950">Driver view (simulated, read-only)</h2>
                  <span className="text-xs text-muted-foreground">{running ? `${live?.progress_pct}% done` : "No trip running"}</span>
                </div>
                {live?.summary && !running && <SummaryCard s={live.summary} />}
                <ol className="space-y-2" data-testid="doorstep-driver-stops">
                  {running && live?.next_stops.length === 0 && <li className="text-sm text-muted-foreground">No more pickups ahead. Heading to the drop facility.</li>}
                  {live?.next_stops.map((p: Pin, i) => (
                    <li key={p.key} className="flex items-center gap-3 rounded-xl border border-emerald-950/10 p-3" data-testid="doorstep-driver-stop">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0D1B13] text-sm font-bold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-emerald-950">{p.label || "No label"}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.kind === "real" ? "Real user · " : ""}{p.name} · {typeLabels(p.waste_types) || "waste"}
                          {p.distance_m !== null ? ` · ${fmtDistance(p.distance_m)}, about ${p.eta_min} min` : ""}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => run(() => apiPost<OkResponse>("/admin/doorstep/trip/collect", { pin_key: p.key }), `${p.name} collected`)} data-testid="doorstep-driver-collected-button">
                        Collected
                      </Button>
                    </li>
                  ))}
                </ol>
                <p className="text-xs text-muted-foreground">The simulation presses “Collected” automatically when the vehicle reaches a stop.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ s }: { s: NonNullable<AdminDoorstepState["summary"]> }) {
  return (
    <Card className="border-teal-200 bg-teal-50/60" data-testid="doorstep-trip-summary">
      <CardContent className="space-y-1 pt-5">
        <p className="font-heading text-base font-semibold text-teal-950" data-testid="doorstep-dropped-at">Dropped at facility {s.facility_name}</p>
        <p className="text-sm text-teal-900">
          {s.distance_km} km · {s.minutes} min · {s.stops} stops · {s.collected} pickups collected · {s.alerts} alerts sent
        </p>
      </CardContent>
    </Card>
  );
}

function FeedCard({ feed }: { feed: { text: string; at: string }[] }) {
  return (
    <Card className="border-emerald-950/10">
      <CardContent className="pt-5">
        <h2 className="mb-2 font-heading text-base font-semibold text-emerald-950">Live alert feed</h2>
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Start a trip to see alerts here.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto" data-testid="doorstep-alert-feed">
            {feed.map((f, i) => (
              <li key={`${f.at}-${i}`} className="text-sm" data-testid="doorstep-feed-item">
                <span className="mr-2 text-xs tabular-nums text-muted-foreground">{new Date(f.at).toLocaleTimeString()}</span>
                {f.text}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
