import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { MessageSquareWarning, ScanLine, ShieldCheck, UserPlus } from "lucide-react";

import { apiGet } from "@/lib/api";
import type { AdminGate, AdminStats } from "@/lib/adminTypes";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader, StatCard } from "@/components/admin/AdminUi";
import { useGuidelines } from "@/components/admin/useGuidelines";

const ACTIVITY_ICON = { scan: ScanLine, feedback: MessageSquareWarning, signup: UserPlus } as const;

export default function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => apiGet<AdminStats>("/admin/stats") });
  const g = useGuidelines();
  const gate = useQuery({ queryKey: ["admin", "gate"], queryFn: () => apiGet<AdminGate>("/admin/gate") });
  const s = stats.data;

  const pieData = Object.entries(s?.by_category ?? {}).map(([key, value]) => ({
    key,
    name: g.label(key),
    value,
    color: g.color(key),
  }));
  const daily = (s?.daily ?? []).map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live overview of waste identification across Chiplun." />

      <div className="flex items-center gap-3 rounded-xl border border-emerald-700/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="admin-account-note">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Admin account:</span> {gate.data?.admin_email ?? "…"} — the only admin of this app
          (set by ADMIN_EMAIL, verified email required).
        </p>
      </div>

      {stats.isError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load statistics.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard testid="admin-stat-users" label="Registered users" value={s?.total_users ?? "—"} hint="Citizens + admins who signed in" />
        <StatCard testid="admin-stat-scans" label="Waste identifications" value={s?.total_scans ?? "—"} hint={`${s?.low_confidence_scans ?? 0} needed a follow-up (low confidence)`} />
        <StatCard testid="admin-stat-feedback" label="Open feedback" value={s?.open_feedback ?? "—"} hint={`${s?.total_feedback ?? 0} received in total`} />
        <StatCard testid="admin-stat-facilities" label="Active facilities" value={s ? `${s.active_facilities}/${s.total_facilities}` : "—"} hint={`${s?.total_eco_points ?? 0} eco points earned by citizens`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="border-emerald-950/10 lg:col-span-3">
          <CardContent className="pt-5">
            <h2 className="font-heading text-base font-bold text-emerald-950">Identifications — last 14 days</h2>
            <div className="mt-3 h-64" data-testid="admin-daily-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
                  <Tooltip formatter={(value: number) => [`${value} scans`, "Scans"]} labelFormatter={(label: string) => `Date: ${label}`} />
                  <Bar dataKey="count" fill="#15803d" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-950/10 lg:col-span-2">
          <CardContent className="pt-5">
            <h2 className="font-heading text-base font-bold text-emerald-950">Waste category counts</h2>
            {pieData.length === 0 ? (
              <p className="mt-6 text-sm text-emerald-950/60">No identifications yet.</p>
            ) : (
              <>
                <div className="mt-2 h-48" data-testid="admin-category-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={78} paddingAngle={3}>
                        {pieData.map((d) => (
                          <Cell key={d.key} fill={d.color} stroke="#fff" strokeWidth={2} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string) => [`${value} scans`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {pieData.map((d) => (
                    <li key={d.key} className="flex items-center justify-between text-sm" data-testid={`admin-category-count-${d.key}`}>
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        {d.name}
                      </span>
                      <span className="font-semibold">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="border-emerald-950/10 lg:col-span-3">
          <CardContent className="pt-5">
            <h2 className="font-heading text-base font-bold text-emerald-950">Recent activity</h2>
            <ul className="mt-3 divide-y divide-emerald-950/8" data-testid="admin-recent-activity">
              {(s?.recent ?? []).map((a, i) => {
                const Icon = ACTIVITY_ICON[a.kind as keyof typeof ACTIVITY_ICON] ?? ScanLine;
                return (
                  <li key={i} className="flex items-start gap-3 py-2.5" data-testid={`admin-activity-${i}`}>
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-700/10 text-emerald-700">
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-emerald-950/85">{a.text}</p>
                      <p className="text-xs text-emerald-950/50">{formatDistanceToNow(new Date(a.at), { addSuffix: true })}</p>
                    </div>
                  </li>
                );
              })}
              {s && s.recent.length === 0 && <li className="py-3 text-sm text-emerald-950/60">No activity yet.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-emerald-950/10 lg:col-span-2">
          <CardContent className="pt-5">
            <h2 className="font-heading text-base font-bold text-emerald-950">Most identified items</h2>
            <ol className="mt-3 space-y-2" data-testid="admin-top-items">
              {(s?.top_items ?? []).map((t, i) => (
                <li key={t.item_name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="mr-2 font-semibold text-emerald-700">{i + 1}.</span>
                    {t.item_name}
                  </span>
                  <span className="shrink-0 rounded-full bg-emerald-700/10 px-2 py-0.5 text-xs font-semibold text-emerald-800">{t.count}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
