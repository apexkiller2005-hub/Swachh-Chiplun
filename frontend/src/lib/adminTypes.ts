// Hand-written mirrors of backend/models/admin.py — keep the two files in sync.
import type { Classification } from "@/lib/types";

export type FeedbackKind = "complaint" | "suggestion" | "facility_issue" | "other";
export type FeedbackStatus = "open" | "in_progress" | "resolved";

export interface Me {
  user_id: string;
  email: string;
  name: string;
  role: string;
}

export interface UserRow {
  user_id: string;
  email: string;
  name: string;
  role: string;
  created_at: string | null;
  last_seen: string | null;
  scan_count: number;
  feedback_count: number;
}

export interface UsersResponse {
  roles: string[];
  users: UserRow[];
}

export interface AdminGate {
  admin_email: string;
  passcode_required: boolean;
  unlocked: boolean;
  locked_until: string | null;
}

export interface PasscodeIn {
  passcode: string;
}

export interface TipIn {
  title: string;
  body: string;
  category: string;
  active: boolean;
}

export interface Tip extends TipIn {
  id: string;
  updated_at: string | null;
}

export interface GuidelineIn {
  key: string;
  name: string;
  description: string;
  examples: string[];
  disposal_steps: string[];
  hazards: string[];
  eco_points: number;
  color: string;
  active: boolean;
}

export interface Guideline extends GuidelineIn {
  id: string;
  updated_at: string | null;
  facility_count: number;
  scan_count: number;
}

export interface FacilityIn {
  name: string;
  categories: string[];
  lat: number;
  lng: number;
  address: string;
  phone: string | null;
  hours: string | null;
  accepts: string[];
  active: boolean;
  type: string;
}

export interface AdminFacility extends FacilityIn {
  id: string;
  source: string;
}

export interface ActiveIn {
  active: boolean;
}

export interface FeedbackIn {
  kind: FeedbackKind;
  message: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  kind: FeedbackKind;
  message: string;
  status: FeedbackStatus;
  admin_reply: string;
  replied_at: string | null;
  created_at: string;
}

export interface FeedbackReplyIn {
  status: FeedbackStatus;
  admin_reply: string;
}

export interface AdminScan extends Classification {
  user_email: string;
}

export interface ScanPage {
  items: AdminScan[];
  total: number;
  page: number;
  page_size: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface ItemCount {
  item_name: string;
  count: number;
}

export interface ActivityItem {
  kind: string;
  text: string;
  at: string;
}

export interface AdminStats {
  total_users: number;
  total_scans: number;
  total_eco_points: number;
  total_feedback: number;
  open_feedback: number;
  active_facilities: number;
  total_facilities: number;
  low_confidence_scans: number;
  by_category: Record<string, number>;
  daily: DayCount[];
  top_items: ItemCount[];
  recent: ActivityItem[];
}

export interface AuditEntry {
  id: string;
  admin_email: string;
  action: string;
  target: string;
  at: string;
}

export interface DeleteResult {
  deleted: number;
}

export const FEEDBACK_KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "complaint", label: "Complaint" },
  { value: "suggestion", label: "Suggestion" },
  { value: "facility_issue", label: "Facility issue" },
  { value: "other", label: "Other" },
];

export const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string; cls: string }[] = [
  { value: "open", label: "Open", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "in_progress", label: "In progress", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  { value: "resolved", label: "Resolved", cls: "bg-green-100 text-green-800 border-green-200" },
];

export function errorMessage(err: unknown, fallback: string): string {
  const body = (err as { body?: { detail?: unknown } } | null)?.body;
  return typeof body?.detail === "string" ? body.detail : fallback;
}
