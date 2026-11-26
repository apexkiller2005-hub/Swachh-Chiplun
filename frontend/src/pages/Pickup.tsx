import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Crosshair, MapPin, Trash2, Truck, X } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/types";
import {
  ALERT_OPTIONS,
  STATUS_META,
  fmtDistance,
  type AlertM,
  type LatLng,
  type OkResponse,
  type PickupAlert,
  type PickupLive,
  type Spot,
  type SpotIn,
} from "@/lib/doorstepTypes";
import DoorstepMap from "@/components/doorstep/DoorstepMap";
import { useConfirm } from "@/components/admin/AdminUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const LIVE_KEY = ["pickup-live"];
const STEPS = ["requested", "near", "collected"] as const;
const errText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong");

export default function Pickup() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const live = useQuery({
    queryKey: LIVE_KEY,
    queryFn: () => apiGet<PickupLive>("/pickup/live"),
    refetchInterval: 4000,
  });
  const data = live.data;
  // opened from the bottom of Home/Facilities: start at the top so the map is visible
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  // -------- spot form (draft until saved)
  const [draft, setDraft] = useState<LatLng | null>(null);
  const [label, setLabel] = useState("My pickup spot");
  const [alertM, setAlertM] = useState<AlertM>(500);
  const [alertsOn, setAlertsOn] = useState(true);
  const [fit, setFit] = useState("");
  const loadedSpot = useRef(false);
  useEffect(() => {
    if (!data || loadedSpot.current) return;
    loadedSpot.current = true;
    if (data.spot) {
      setDraft({ lat: data.spot.lat, lng: data.spot.lng });
      setLabel(data.spot.label);
      setAlertM(([300, 500, 1000].includes(data.spot.alert_m) ? data.spot.alert_m : 500) as AlertM);
      setAlertsOn(data.spot.alerts_on);
    }
    setFit("initial");
  }, [data]);

  const saveSpot = useMutation({
    mutationFn: (body: SpotIn) => apiPut<Spot>("/pickup/spot", body),
    onSuccess: () => {
      toast.success("Pickup spot saved");
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });
  const deleteSpot = useMutation({
    mutationFn: () => apiDelete<OkResponse>("/pickup/spot"),
    onSuccess: () => {
      setDraft(null);
      toast.success("Pickup spot deleted");
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Location is not available on this device");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDraft({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setFit(`me-${Date.now()}`);
        toast.message("Pin placed at your location — drag it to adjust, then Save");
      },
      () => toast.error("Could not get your location. Click the map to place your pin instead."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  // -------- "I have waste today"
  const [types, setTypes] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const request = useMutation({
    mutationFn: () => apiPost<Spot>("/pickup/request", { waste_types: types, note }),
    onSuccess: () => {
      toast.success("Pickup requested — we will alert you when the vehicle is near");
      setNote("");
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });
  const cancel = useMutation({
    mutationFn: () => apiDelete<OkResponse>("/pickup/request"),
    onSuccess: () => {
      toast.success("Pickup request cancelled");
      void qc.invalidateQueries({ queryKey: LIVE_KEY });
    },
    onError: (e) => toast.error(errText(e)),
  });

  // -------- alerts: banner + browser notification, once per new alert
  const seen = useRef<Set<string> | null>(null);
  const [banner, setBanner] = useState<PickupAlert | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  useEffect(() => {
    if (!data) return;
    if (seen.current === null) {
      seen.current = new Set(data.alerts.map((a) => a.id)); // old alerts never pop up again
      return;
    }
    const fresh = data.alerts.filter((a) => !seen.current!.has(a.id));
    fresh.forEach((a) => seen.current!.add(a.id));
    if (fresh.length) {
      const a = fresh[0];
      setBanner(a);
      if (perm === "granted") {
        try {
          new Notification("Garbage vehicle is near (Demo)", { body: `${a.text_en}\n${a.text_mr}`, tag: a.id });
        } catch {
          /* some mobile browsers only allow notifications from a service worker */
        }
      }
    }
  }, [data, perm]);
  const askPermission = async () => {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  };

  const spot = data?.spot ?? null;
  const req = spot?.request ?? null;
  const status = data?.status ?? "waiting";
  const unsaved =
    !!draft && (!spot || spot.lat !== draft.lat || spot.lng !== draft.lng || spot.label !== label || spot.alert_m !== alertM || spot.alerts_on !== alertsOn);

  return (
    <div className="space-y-5">
      {dialog}
      {banner && (
        <div
          role="alert"
          data-testid="pickup-alert-banner"
          className="sticky top-20 z-30 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-lg animate-in fade-in slide-in-from-top-2"
        >
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-blue-950" data-testid="pickup-alert-banner-en">{banner.text_en}</p>
            <p className="text-sm text-blue-900" data-testid="pickup-alert-banner-mr">{banner.text_mr}</p>
          </div>
          <button aria-label="Dismiss alert" onClick={() => setBanner(null)} className="rounded-md p-1 text-blue-800 hover:bg-blue-100" data-testid="pickup-alert-banner-dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Doorstep garbage vehicle</p>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold text-emerald-950 md:text-3xl" data-testid="pickup-title">
            Pickup
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-800" data-testid="pickup-demo-badge">Demo</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The vehicle on this page is simulated by the admin for a demonstration. Save your spot near the green route, tell us you have waste, and you will be alerted when it is close.
          </p>
        </div>
        {perm !== "unsupported" && perm !== "granted" && (
          <Button variant="outline" onClick={askPermission} data-testid="pickup-enable-notifications-button">
            <BellRing className="h-4 w-4" /> Enable browser alerts
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-3">
          <DoorstepMap
            testid="pickup-map"
            route={data?.vehicle?.path ?? data?.route?.points ?? null}
            vehicle={data?.vehicle ?? null}
            pins={draft ? [{ key: "me", ...draft, color: STATUS_META[status].hex, text: "", tooltip: `${label} (drag to move)`, draggable: true, selected: true }] : []}
            onMapClick={(p) => setDraft(p)}
            onPinDrag={(_k, p) => setDraft(p)}
            fitKey={fit}
          />
          <p className="text-xs text-muted-foreground" data-testid="pickup-map-hint">
            Click anywhere on the map to drop your pin, then drag it to the exact spot. Green line = today's demo route{data?.route ? ` (${data.route.name})` : ""}.
          </p>
        </div>

        <div className="space-y-4">
          {/* live vehicle */}
          <Card className="border-emerald-950/10">
            <CardContent className="flex items-center gap-4 pt-5">
              <span className={cn("flex h-12 w-12 items-center justify-center rounded-xl", data?.vehicle ? "bg-[#0D1B13] text-emerald-300" : "bg-slate-100 text-slate-400")}>
                <Truck className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0" data-testid="pickup-vehicle-status">
                {data?.vehicle ? (
                  spot && data.eta_min !== null && data.distance_m !== null ? (
                    <>
                      <p className="font-heading text-lg font-semibold text-emerald-950" data-testid="pickup-eta">About {data.eta_min} minute{data.eta_min === 1 ? "" : "s"} away</p>
                      <p className="text-sm text-muted-foreground" data-testid="pickup-distance">
                        {fmtDistance(data.distance_m)} from your spot · {data.vehicle.state === "paused" ? "paused" : "on the way"}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-emerald-950">The vehicle is out on its route. Save your spot to see the ETA.</p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">The vehicle is not running right now (demo). Keep this page open.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* spot form */}
          <Card className="border-emerald-950/10">
            <CardContent className="space-y-3 pt-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-heading text-base font-semibold text-emerald-950">My pickup spot</h2>
                <Button size="sm" variant="ghost" onClick={useMyLocation} data-testid="pickup-use-location-button">
                  <Crosshair className="h-4 w-4" /> Use my location
                </Button>
              </div>
              {!draft && (
                <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-900" data-testid="pickup-no-spot">
                  <MapPin className="h-4 w-4" /> Click the map to place your pin.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="spot-label">Label (building / landmark)</Label>
                <Input id="spot-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} data-testid="pickup-label-input" />
              </div>
              <div className="space-y-1.5">
                <Label>Alert me when the vehicle is within</Label>
                <div className="flex gap-2" role="radiogroup">
                  {ALERT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      role="radio"
                      aria-checked={alertM === o.value}
                      onClick={() => setAlertM(o.value)}
                      data-testid={`pickup-alert-distance-${o.value}`}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-[background-color,color,border-color]",
                        alertM === o.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-950/15 bg-white hover:bg-emerald-50",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-950/10 px-3 py-2">
                <span className="text-sm font-medium">Alerts</span>
                <button
                  role="switch"
                  aria-checked={alertsOn}
                  onClick={() => setAlertsOn((v) => !v)}
                  data-testid="pickup-alerts-switch"
                  className={cn("relative h-6 w-11 shrink-0 rounded-full p-0 transition-colors", alertsOn ? "bg-emerald-600" : "bg-slate-300")}
                >
                  <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", alertsOn ? "translate-x-5" : "translate-x-0")} />
                </button>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!draft || saveSpot.isPending}
                  onClick={() => draft && saveSpot.mutate({ label, lat: draft.lat, lng: draft.lng, alert_m: alertM, alerts_on: alertsOn })}
                  data-testid="pickup-save-spot-button"
                >
                  {spot ? (unsaved ? "Save changes" : "Saved") : "Save spot"}
                </Button>
                {spot && (
                  <Button
                    variant="outline"
                    aria-label="Delete pickup spot"
                    onClick={() => confirm("Delete your pickup spot? Any pickup request is removed too.", () => deleteSpot.mutate())}
                    data-testid="pickup-delete-spot-button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* request */}
          <Card className="border-emerald-950/10">
            <CardContent className="space-y-3 pt-5">
              <h2 className="font-heading text-base font-semibold text-emerald-950">I have waste today</h2>
              {req ? (
                <>
                  <ol className="flex items-center gap-1" data-testid="pickup-status-steps">
                    {STEPS.map((s, i) => {
                      const reached = STEPS.indexOf(req.status) >= i;
                      return (
                        <li key={s} className="flex flex-1 items-center gap-1">
                          <span
                            data-testid={`pickup-step-${s}`}
                            data-reached={reached}
                            className={cn(
                              "flex-1 rounded-lg border px-2 py-1.5 text-center text-xs font-semibold transition-colors",
                              reached ? STATUS_META[s].pill : "border-slate-200 bg-white text-slate-400",
                            )}
                          >
                            {STATUS_META[s].label}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="text-sm" data-testid="pickup-request-status">
                    Status: <strong>{STATUS_META[req.status].label}</strong> ·{" "}
                    {req.waste_types.map((t) => CATEGORY_META[t as keyof typeof CATEGORY_META]?.label ?? t).join(", ")}
                    {req.note ? ` · “${req.note}”` : ""}
                  </p>
                  <div className="flex gap-2">
                    {req.status === "collected" && (
                      <Button variant="outline" onClick={() => cancel.mutate()} data-testid="pickup-new-request-button">New request</Button>
                    )}
                    {req.status !== "collected" && (
                      <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending} data-testid="pickup-cancel-request-button">
                        Cancel request
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_ORDER.map((c) => {
                      const on = types.includes(c);
                      return (
                        <button
                          key={c}
                          aria-pressed={on}
                          onClick={() => setTypes((t) => (on ? t.filter((x) => x !== c) : [...t, c]))}
                          data-testid={`pickup-waste-type-${c}`}
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-semibold transition-[background-color,border-color,transform] active:scale-95",
                            on ? CATEGORY_META[c].pill : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                          )}
                        >
                          {CATEGORY_META[c].label}
                        </button>
                      );
                    })}
                  </div>
                  <Textarea placeholder="Optional note (e.g. 2 bags, near the gate)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="pickup-note-input" />
                  <Button
                    className="w-full"
                    disabled={!spot || types.length === 0 || request.isPending}
                    onClick={() => request.mutate()}
                    data-testid="pickup-request-button"
                  >
                    I have waste today
                  </Button>
                  {!spot && <p className="text-xs text-muted-foreground">Save your pickup spot first.</p>}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* alert history */}
      <Card className="border-emerald-950/10">
        <CardContent className="pt-5">
          <h2 className="mb-3 font-heading text-base font-semibold text-emerald-950">My recent alerts</h2>
          {data && data.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="pickup-alerts-empty">No alerts yet.</p>
          ) : (
            <ul className="divide-y divide-emerald-950/5" data-testid="pickup-alerts-list">
              {data?.alerts.map((a) => (
                <li key={a.id} className="py-2 text-sm" data-testid="pickup-alert-item">
                  <p className="text-emerald-950">{a.text_en}</p>
                  <p className="text-muted-foreground">{a.text_mr}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.at).toLocaleString()} · {fmtDistance(a.distance_m)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
