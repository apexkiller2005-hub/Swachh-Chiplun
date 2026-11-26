import { useEffect, useRef } from "react";
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";

// Click anywhere on the map to set the facility's latitude / longitude.
export default function MapPicker({
  lat,
  lng,
  onPick,
}: {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<leaflet.Map | null>(null);
  const markerRef = useRef<leaflet.CircleMarker | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const start: [number, number] = [Number.isFinite(lat) ? lat : 17.5323, Number.isFinite(lng) ? lng : 73.5186];
    const map = leaflet.map(divRef.current).setView(start, 13);
    leaflet
      .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      })
      .addTo(map);
    markerRef.current = leaflet
      .circleMarker(start, { radius: 9, color: "#fff", weight: 2, fillColor: "#15803d", fillOpacity: 0.95 })
      .addTo(map);
    map.on("click", (e: leaflet.LeafletMouseEvent) => {
      markerRef.current?.setLatLng(e.latlng);
      pickRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    });
    mapRef.current = map;
    // the map sits inside a dialog that animates open — re-measure once it is visible
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) markerRef.current?.setLatLng([lat, lng]);
  }, [lat, lng]);

  return (
    <div
      ref={divRef}
      className="h-56 w-full overflow-hidden rounded-xl border border-emerald-950/15"
      data-testid="facility-map-picker"
      aria-label="Click on the map to choose the location"
    />
  );
}
