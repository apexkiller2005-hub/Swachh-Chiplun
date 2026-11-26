import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/react";
import {
  ClipboardList,
  Lightbulb,
  Building2,
  History,
  LayoutDashboard,
  MessageSquareWarning,
  Recycle,
  Settings,
  Truck,
  ShieldAlert,
  Tags,
  Users,
} from "lucide-react";

import { useQuery } from "@tanstack/react-query";

import AdminPasscodeGate from "@/components/admin/AdminPasscodeGate";
import { apiGet } from "@/lib/api";
import type { AdminGate } from "@/lib/adminTypes";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useMe } from "@/lib/useMe";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, testid: "admin-nav-dashboard", end: true },
  { to: "/admin/records", label: "Waste records", icon: ClipboardList, testid: "admin-nav-records" },
  { to: "/admin/categories", label: "Categories & rules", icon: Tags, testid: "admin-nav-categories" },
  { to: "/admin/facilities", label: "Facilities", icon: Building2, testid: "admin-nav-facilities" },
  { to: "/admin/users", label: "Users", icon: Users, testid: "admin-nav-users" },
  { to: "/admin/tips", label: "Tips & knowledge", icon: Lightbulb, testid: "admin-nav-tips" },
  { to: "/admin/feedback", label: "Feedback", icon: MessageSquareWarning, testid: "admin-nav-feedback" },
  { to: "/admin/audit", label: "Audit log", icon: History, testid: "admin-nav-audit" },
  { to: "/admin/doorstep", label: "Doorstep Demo", icon: Truck, testid: "admin-nav-doorstep" },
  { to: "/admin/settings", label: "Settings", icon: Settings, testid: "admin-nav-settings" },
];

export default function AdminLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const gate = useQuery({
    queryKey: ["admin", "gate"],
    queryFn: () => apiGet<AdminGate>("/admin/gate"),
    enabled: !!isSignedIn && isAdmin,
  });

  if (!isLoaded || (isSignedIn && me.isLoading) || (isAdmin && gate.isLoading)) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0D1B13] text-emerald-50">
        <Recycle className="h-8 w-8 animate-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to={`/sign-in?redirect_url=${encodeURIComponent(`${window.location.origin}/admin`)}`} replace />;
  }

  if (me.data?.role !== "admin") {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#F4F7F4] px-4 text-center" data-testid="admin-access-denied">
        <ShieldAlert className="h-12 w-12 text-red-600" aria-hidden />
        <h1 className="font-heading text-2xl font-bold text-emerald-950">Admin access only</h1>
        <p className="max-w-sm text-sm text-emerald-950/65">
          This area is for the Chiplun town administrator. Your account does not have admin rights.
        </p>
        <Button render={<Link to="/" />} data-testid="admin-denied-home-link">
          Back to Swachh Chiplun
        </Button>
      </div>
    );
  }

  if (gate.data && !gate.data.unlocked) return <AdminPasscodeGate gate={gate.data} />;

  return (
    <div className="min-h-svh bg-[#F4F7F4] md:grid md:grid-cols-[240px_1fr]">
      <aside className="hidden flex-col bg-[#0D1B13] text-emerald-50 md:sticky md:top-0 md:flex md:h-svh">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950">
            <Recycle className="h-5 w-5" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="font-heading text-base font-bold">Swachh Chiplun</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">Admin console</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Admin navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testid}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-emerald-500/15 text-emerald-200" : "text-emerald-50/75 hover:bg-white/5",
                )
              }
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-3 border-t border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <UserButton />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold" data-testid="admin-current-name">{me.data?.name}</p>
              <p className="truncate text-[11px] text-emerald-200/70">{me.data?.email}</p>
            </div>
          </div>
          <Link to="/" className="block text-xs text-emerald-300 hover:underline" data-testid="admin-open-citizen-app">
            ← Open citizen app
          </Link>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-[#0D1B13] px-4 py-3 text-emerald-50 md:hidden">
          <p className="font-heading font-bold">Swachh Chiplun · Admin</p>
          <UserButton />
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-emerald-950/10 bg-white px-3 py-2 md:hidden" aria-label="Admin mobile navigation">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`${item.testid}-mobile`}
              className={({ isActive }) =>
                cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold",
                  isActive ? "bg-emerald-700 text-white" : "bg-[#F4F7F4] text-emerald-900",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
      <Toaster richColors position="bottom-right" />
    </div>
  );
}
