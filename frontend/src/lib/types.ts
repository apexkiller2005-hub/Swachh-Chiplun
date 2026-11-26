// Hand-written mirrors of the Pydantic models in backend/models/waste.py — nothing
// infers across the HTTP boundary, so keep this file in sync with that one.

export type Language = "en" | "hi" | "mr";
export type Category = "ewaste" | "recyclable" | "general" | "organic" | "hazardous" | "biomedical";

export interface Classification {
  id: string;
  item_name: string;
  category: Category;
  subcategory: string;
  confidence: number;
  disposal_steps: string[];
  hazards: string[];
  eco_tip: string;
  eco_points: number;
  needs_follow_up: boolean;
  follow_up_question: string;
  follow_up_options: string[];
  language: Language;
  hint: string | null;
  created_at: string;
  category_label: string;
  user_id: string | null;
}

export interface ScanContext {
  item_name: string;
  category: string;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Facility {
  id: string;
  name: string;
  categories: Category[];
  lat: number;
  lng: number;
  address: string;
  phone: string | null;
  hours: string | null;
  accepts: string[];
  source: "seed" | "osm" | "admin";
  distance_m: number | null;
  active: boolean;
}

export interface ChatResponse {
  reply: string;
  facilities_used: Facility[];
  fallback: boolean;
}

export interface ScanDeleteResponse {
  deleted: number;
}

export interface Stats {
  total_scans: number;
  eco_points: number;
  by_category: Record<string, number>;
}

export interface GateStatus {
  unlocked: boolean;
}

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिंदी" },
  { value: "mr", label: "मराठी" },
];

export const CATEGORY_ORDER: Category[] = [
  "ewaste",
  "recyclable",
  "general",
  "organic",
  "hazardous",
  "biomedical",
];

export const CATEGORY_META: Record<
  Category,
  { label: string; pill: string; dot: string; hex: string }
> = {
  ewaste: { label: "E-waste", pill: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500", hex: "#F59E0B" },
  recyclable: { label: "Recyclable", pill: "bg-blue-100 text-blue-800 border-blue-200", dot: "bg-blue-500", hex: "#3B82F6" },
  general: { label: "General", pill: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400", hex: "#64748B" },
  organic: { label: "Organic", pill: "bg-green-100 text-green-800 border-green-200", dot: "bg-green-500", hex: "#22C55E" },
  hazardous: { label: "Hazardous", pill: "bg-red-100 text-red-800 border-red-200", dot: "bg-red-500", hex: "#EF4444" },
  biomedical: { label: "Biomedical", pill: "bg-rose-100 text-rose-800 border-rose-200", dot: "bg-rose-500", hex: "#F43F5E" },
};

export function asCategory(value: string): Category {
  return (CATEGORY_ORDER as string[]).includes(value) ? (value as Category) : "general";
}