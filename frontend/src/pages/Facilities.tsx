import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Crosshair, MapPin, Phone, Navigation } from "lucide-react";
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { toast } from "sonner";

import { apiGet } from "@/lib/api";
import { PickupPromoCard } from "@/components/doorstep/DoorstepMap";
import { CATEGORY_META, CATEGORY_ORDER, asCategory, type Category, type Facility } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const CHIPLUN = { lat: 17.5323, lng: 73.5186 };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export default function Facilities() {
  const [filter, setFilter] = useState<Category | "all">("all");
  const [coords, setCoords] = useState(CHIPLUN);

  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<leaflet.Map | null>(null);
  const layerRef = useRef<leaflet.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    const map = leaflet.map(mapDivRef.current).setView([CHIPLUN.lat, CHIPLUN.lng], 12);
    leaflet
      .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
      .addTo(map);
    layerRef.current = leaflet.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  const query = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng), live: "1" });
  if (filter !== "all") query.set("category", filter);

  const facilitiesQuery = useQuery({
    queryKey: ["facilities", filter, coords.lat.toFixed(4), coords.lng.toFixed(4)],
    queryFn: () => apiGet<Facility[]>(`/facilities?${query.toString()}`),
    staleTime: 5 * 60_000,
  });

  const facilities = facilitiesQuery.data ?? [];

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const f of facilities) {
      leaflet
        .circleMarker([f.lat, f.lng], {
          radius: 9,
          color: "#ffffff",
          weight: 2,
          fillColor: CATEGORY_META[asCategory(f.categories[0] ?? "general")].hex,
          fillOpacity: 0.95,
        })
        .bindPopup(
          `<strong>${escapeHtml(f.name)}</strong><br/>${escapeHtml(f.address)}${
            f.hours ? `<br/><em>${escapeHtml(f.hours)}</em>` : ""
          }${f.phone ? `<br/><a href="tel:${escapeHtml(f.phone)}">${escapeHtml(f.phone)}</a>` : ""}`,
        )
        .addTo(layer);
    }
  }, [facilities]);

  const locate = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported — showing Chiplun centre");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 13);
        toast.success("Showing facilities near you");
      },
      () => toast.error("Location permission denied — showing Chiplun centre"),
    );
  };

  return (
    <div className="space-y-5">
      <PickupPromoCard testid="facilities-pickup-card" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter facilities by waste type">
          <button
            type="button"
            onClick={() => setFilter("all")}
            data-testid="facilities-filter-all"
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
              filter === "all"
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-emerald-900/15 bg-white text-emerald-800 hover:bg-emerald-50",
            )}
          >
            All types
          </button>
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilter(cat)}
              data-testid={`facilities-filter-${cat}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                filter === cat
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-emerald-900/15 bg-white text-emerald-800 hover:bg-emerald-50",
              )}
            >
              <span className={cn("mr-1.5 inline-block h-2 w-2 rounded-full", CATEGORY_META[cat].dot)} aria-hidden />
              {CATEGORY_META[cat].label}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={locate} data-testid="facilities-locate">
          <Crosshair className="mr-1 h-4 w-4" aria-hidden /> Use my location
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="overflow-hidden border-emerald-950/10 lg:col-span-3">
          <div ref={mapDivRef} className="h-[380px] w-full lg:h-[560px]" data-testid="facilities-map" />
        </Card>

        <div className="space-y-3 lg:col-span-2 lg:max-h-[560px] lg:overflow-y-auto lg:pr-1">
          {facilitiesQuery.isLoading && <p className="text-sm text-emerald-950/60">Loading facilities…</p>}
          {facilitiesQuery.isError && (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Could not load facilities — check that the backend is running.
            </p>
          )}
          {!facilitiesQuery.isLoading && facilities.length === 0 && !facilitiesQuery.isError && (
            <p className="rounded-xl border border-emerald-950/10 bg-[#F4F7F4] p-4 text-sm text-emerald-950/70">
              No facilities found for this waste type yet — try another category filter.
            </p>
          )}
          {facilities.map((f) => (
            <Card key={f.id} size="sm" className="lift border-emerald-950/10" data-testid={`facility-card-${f.id}`}>
              <CardContent className="space-y-2.5 pt-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-heading text-sm font-bold leading-snug text-emerald-950">{f.name}</h3>
                  <span className="shrink-0 rounded-full bg-emerald-700/10 px-2 py-0.5 text-xs font-bold text-emerald-800" data-testid={`facility-distance-${f.id}`}>
                    {f.distance_m != null ? `${(f.distance_m / 1000).toFixed(1)} km` : "—"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {f.categories.map((c) => (
                    <span key={c} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CATEGORY_META[asCategory(c)].pill}`}>
                      {CATEGORY_META[asCategory(c)].label}
                    </span>
                  ))}
                </div>
                <p className="flex items-start gap-1.5 text-xs leading-relaxed text-emerald-950/70">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {f.address}
                </p>
                {f.hours && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-950/70">
                    <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> {f.hours}
                  </p>
                )}
                {f.phone && (
                  <a href={`tel:${f.phone}`} className="flex items-center gap-1.5 text-xs text-emerald-700 underline-offset-2 hover:underline" data-testid={`facility-phone-${f.id}`}>
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden /> {f.phone}
                  </a>
                )}
                {f.accepts.length > 0 && (
                  <p className="text-xs text-emerald-950/55">Accepts: {f.accepts.join(", ")}</p>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    render={
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    data-testid={`facility-directions-${f.id}`}
                  >
                    <Navigation className="mr-1 h-3.5 w-3.5" aria-hidden /> Directions
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    render={
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=17/${f.lat}/${f.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    }
                    data-testid={`facility-osm-${f.id}`}
                  >
                    View on OSM
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}