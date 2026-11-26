// Doorstep Garbage Vehicle — DEMO ONLY. Hand-written mirrors of backend/models/doorstep.py.

export interface LatLng {
  lat: number;
  lng: number;
}

export type AlertM = 300 | 500 | 1000;
export type PinStatus = "waiting" | "requested" | "near" | "collected";

export interface PickupRequest {
  waste_types: string[];
  note: string;
  status: "requested" | "near" | "collected";
  created_at: string;
}

export interface Spot {
  label: string;
  lat: number;
  lng: number;
  alert_m: number;
  alerts_on: boolean;
  request: PickupRequest | null;
}

export interface SpotIn {
  label: string;
  lat: number;
  lng: number;
  alert_m: AlertM;
  alerts_on: boolean;
}

export interface PickupAlert {
  id: string;
  text_en: string;
  text_mr: string;
  distance_m: number;
  eta_min: number;
  at: string;
}

export interface RouteView {
  id: string;
  name: string;
  points: LatLng[];
  is_demo: boolean;
}

export interface VehicleView {
  lat: number;
  lng: number;
  state: "running" | "paused" | "stopped" | "finished";
  mode: "auto" | "manual";
  speed: number;
  path: LatLng[];
}

export interface PickupLive {
  route: RouteView | null;
  vehicle: VehicleView | null;
  spot: Spot | null;
  status: PinStatus;
  distance_m: number | null;
  eta_min: number | null;
  alerts: PickupAlert[];
}

export interface OkResponse {
  ok: boolean;
}

export interface RouteIn {
  name: string;
  points: LatLng[];
  time_window: string;
  facility_id: string | null;
}

export interface Route extends RouteIn {
  id: string;
  facility_name: string;
  is_demo: boolean;
}

export interface DemoUserIn {
  name: string;
  label: string;
  lat: number;
  lng: number;
  alert_m: AlertM;
  waste_types: string[];
  has_waste: boolean;
}

export interface DemoUser extends DemoUserIn {
  id: string;
  is_demo: boolean;
}

export interface Pin {
  key: string;
  kind: "demo" | "real";
  name: string;
  label: string;
  lat: number;
  lng: number;
  alert_m: number;
  waste_types: string[];
  status: PinStatus;
  distance_m: number | null;
  eta_min: number | null;
}

export interface FeedItem {
  text: string;
  at: string;
}

export interface TripSummary {
  facility_name: string;
  distance_km: number;
  minutes: number;
  collected: number;
  alerts: number;
  stops: number;
}

export interface AdminDoorstepState {
  trip_id: string | null;
  route_id: string | null;
  vehicle: VehicleView | null;
  progress_pct: number;
  pins: Pin[];
  feed: FeedItem[];
  next_stops: Pin[];
  summary: TripSummary | null;
}

export interface DemoDataCounts {
  demo_users: number;
  demo_trips: number;
}

export const ALERT_OPTIONS: { value: AlertM; label: string }[] = [
  { value: 300, label: "300 m" },
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
];

export const STATUS_META: Record<PinStatus, { label: string; hex: string; pill: string }> = {
  waiting: { label: "Waiting", hex: "#94A3B8", pill: "bg-slate-100 text-slate-700 border-slate-200" },
  requested: { label: "Requested", hex: "#F59E0B", pill: "bg-amber-100 text-amber-800 border-amber-200" },
  near: { label: "Vehicle near", hex: "#2563EB", pill: "bg-blue-100 text-blue-800 border-blue-200" },
  collected: { label: "Collected", hex: "#16A34A", pill: "bg-green-100 text-green-800 border-green-200" },
};

export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
