import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

import type { LatLng } from "@/lib/doorstepTypes";

// Same free OpenStreetMap + Leaflet setup as the Facilities page.
const CHIPLUN: LatLng = { lat: 17.5323, lng: 73.5186 };

export interface MapPin {
  key: string;
  lat: number;
  lng: number;
  color: string;
  text?: string; // short text inside the dot (number / "R")
  tooltip: string;
  draggable?: boolean;
  square?: boolean; // real users are drawn as squares
  selected?: boolean;
}

interface Props {
  route?: LatLng[] | null;
  draft?: LatLng[] | null;
  vehicle?: LatLng | null;
  vehicleDraggable?: boolean;
  pins?: MapPin[];
  facility?: (LatLng & { name: string }) | null;
  marker?: LatLng | null; // a temporary point (e.g. chosen start)
  onMapClick?: (p: LatLng) => void;
  onPinDrag?: (key: string, p: LatLng) => void;
  onPinClick?: (key: string) => void;
  onVehicleDrag?: (p: LatLng) => void;
  fitKey?: string; // change it to re-fit the map to the route/pins
  className?: string;
  testid: string;
}

const TRUCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>';

function pinIcon(p: MapPin) {
  const size = p.selected ? 26 : 22;
  const radius = p.square ? "5px" : "50%";
  const ring = p.selected ? "0 0 0 4px rgba(13,27,19,.35)," : "";
  return leaflet.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:${radius};background:${p.color};border:2.5px solid ${
      p.square ? "#4C1D95" : "#fff"
    };box-shadow:${ring}0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 10px/1 sans-serif">${
      p.text ?? ""
    }</div>`,
  });
}

const vehicleIcon = leaflet.divIcon({
  className: "",
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  html: `<div style="width:34px;height:34px;border-radius:10px;background:#0D1B13;border:3px solid #34D399;box-shadow:0 4px 12px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">${TRUCK_SVG}</div>`,
});

export default function DoorstepMap(props: Props) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<leaflet.Map | null>(null);
  const lineLayer = useRef<leaflet.LayerGroup | null>(null);
  const pinMarkers = useRef(new Map<string, leaflet.Marker>());
  const dragging = useRef(new Set<string>());
  const vehicleMarker = useRef<leaflet.Marker | null>(null);
  const handlers = useRef(props);
  handlers.current = props;

  useEffect(() => {
    if (!divRef.current) return;
    const map = leaflet.map(divRef.current).setView([CHIPLUN.lat, CHIPLUN.lng], 14);
    leaflet
      .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      })
      .addTo(map);
    lineLayer.current = leaflet.layerGroup().addTo(map);
    map.on("click", (e: leaflet.LeafletMouseEvent) => handlers.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    const markers = pinMarkers.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      vehicleMarker.current = null;
    };
  }, []);

  // route line, drafted route, facility and temporary marker (cheap: rebuilt on change)
  const routeSig = JSON.stringify([props.route, props.draft, props.facility, props.marker]);
  useEffect(() => {
    const layer = lineLayer.current;
    if (!layer) return;
    layer.clearLayers();
    const { route, draft, facility, marker } = handlers.current;
    if (route && route.length > 1) {
      leaflet.polyline(route.map((p) => [p.lat, p.lng] as [number, number]), { color: "#059669", weight: 6, opacity: 0.75, interactive: false }).addTo(layer);
      route.forEach((p, i) => {
        const end = i === 0 || i === route.length - 1;
        leaflet
          .circleMarker([p.lat, p.lng], { radius: end ? 7 : 5, color: "#065F46", weight: 2, fillColor: end ? "#065F46" : "#fff", fillOpacity: 1, bubblingMouseEvents: false })
          .bindTooltip(i === 0 ? "Route start" : i === route.length - 1 ? "Route end" : `Stop ${i}`)
          // a click on a stop still counts as a click on the map (place pin / add point)
          .on("click", (e: leaflet.LeafletMouseEvent) => handlers.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
          .addTo(layer);
      });
    }
    if (draft && draft.length > 0) {
      leaflet.polyline(draft.map((p) => [p.lat, p.lng] as [number, number]), { color: "#7C3AED", weight: 4, dashArray: "6 6", interactive: false }).addTo(layer);
      draft.forEach((p, i) =>
        leaflet
          .marker([p.lat, p.lng], {
            icon: leaflet.divIcon({
              className: "",
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              html: `<div style="width:20px;height:20px;border-radius:50%;background:#7C3AED;color:#fff;border:2px solid #fff;font:700 10px/16px sans-serif;text-align:center">${i === 0 ? "S" : i}</div>`,
            }),
          })
          .addTo(layer),
      );
    }
    if (facility) {
      leaflet
        .circleMarker([facility.lat, facility.lng], { radius: 9, color: "#fff", weight: 3, fillColor: "#0F766E", fillOpacity: 1 })
        .bindTooltip(`Drop facility: ${facility.name}`)
        .addTo(layer);
    }
    if (marker) {
      leaflet.circleMarker([marker.lat, marker.lng], { radius: 8, color: "#0D1B13", weight: 3, fillColor: "#FACC15", fillOpacity: 1 }).bindTooltip("Chosen start").addTo(layer);
    }
  }, [routeSig]);

  // pins: update in place so a pin being dragged is never replaced mid-drag
  const pinSig = JSON.stringify(props.pins ?? []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const p of handlers.current.pins ?? []) {
      seen.add(p.key);
      let m = pinMarkers.current.get(p.key);
      if (!m) {
        m = leaflet.marker([p.lat, p.lng], { icon: pinIcon(p), draggable: !!p.draggable }).addTo(map);
        const key = p.key;
        m.on("dragstart", () => dragging.current.add(key));
        m.on("dragend", (e) => {
          dragging.current.delete(key);
          const ll = (e.target as leaflet.Marker).getLatLng();
          handlers.current.onPinDrag?.(key, { lat: ll.lat, lng: ll.lng });
        });
        m.on("click", () => handlers.current.onPinClick?.(key));
        pinMarkers.current.set(p.key, m);
      } else if (!dragging.current.has(p.key)) {
        m.setLatLng([p.lat, p.lng]);
        m.setIcon(pinIcon(p));
        if (p.draggable) m.dragging?.enable();
        else m.dragging?.disable();
      }
      m.unbindTooltip().bindTooltip(p.tooltip);
    }
    for (const [key, m] of pinMarkers.current) {
      if (!seen.has(key)) {
        m.remove();
        pinMarkers.current.delete(key);
      }
    }
  }, [pinSig]);

  // vehicle marker
  const vSig = JSON.stringify([props.vehicle, props.vehicleDraggable]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { vehicle, vehicleDraggable } = handlers.current;
    if (!vehicle) {
      vehicleMarker.current?.remove();
      vehicleMarker.current = null;
      return;
    }
    if (!vehicleMarker.current) {
      const m = leaflet.marker([vehicle.lat, vehicle.lng], { icon: vehicleIcon, zIndexOffset: 1000, draggable: !!vehicleDraggable }).addTo(map);
      m.bindTooltip("Garbage vehicle (Demo)");
      m.on("dragstart", () => dragging.current.add("__vehicle"));
      m.on("dragend", (e) => {
        dragging.current.delete("__vehicle");
        const ll = (e.target as leaflet.Marker).getLatLng();
        handlers.current.onVehicleDrag?.({ lat: ll.lat, lng: ll.lng });
      });
      vehicleMarker.current = m;
    } else if (!dragging.current.has("__vehicle")) {
      vehicleMarker.current.setLatLng([vehicle.lat, vehicle.lng]);
    }
    if (vehicleDraggable) vehicleMarker.current.dragging?.enable();
    else vehicleMarker.current.dragging?.disable();
  }, [vSig]);

  // fit to route + pins when fitKey changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !props.fitKey) return;
    const pts: [number, number][] = [
      ...(handlers.current.route ?? []).map((p) => [p.lat, p.lng] as [number, number]),
      ...(handlers.current.pins ?? []).map((p) => [p.lat, p.lng] as [number, number]),
    ];
    if (pts.length > 1) map.fitBounds(leaflet.latLngBounds(pts).pad(0.15));
    else if (pts.length === 1) map.setView(pts[0], 16);
  }, [props.fitKey]);

  return (
    <div
      ref={divRef}
      data-testid={props.testid}
      className={props.className ?? "relative z-0 h-[360px] w-full overflow-hidden rounded-2xl border border-emerald-950/10 md:h-[460px]"}
    />
  );
}

/** Small entry card used on Home and Facilities (the bottom navigation stays unchanged). */
export function PickupPromoCard({ testid }: { testid: string }) {
  return (
    <Link
      to="/pickup"
      data-testid={testid}
      className="lift group flex items-center gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm transition-[transform,box-shadow] hover:shadow-md"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0D1B13] text-emerald-300">
        <Truck className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-heading text-base font-semibold text-emerald-950">
          Doorstep Pickup
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">Demo</span>
        </span>
        <span className="block text-sm text-muted-foreground">
          Can't walk to a drop point? Save your spot and get alerted when the garbage vehicle is near.
        </span>
      </span>
    </Link>
  );
}
