import { Navigate, NavLink, Outlet } from "react-router-dom";
import { UserButton, useAuth } from "@clerk/react";
import { Leaf, LayoutDashboard, MapPin, MessageCircle, Recycle, ScanLine, ShieldCheck } from "lucide-react";

import FeedbackDialog from "@/components/FeedbackDialog";
import { Toaster } from "@/components/ui/sonner";
import { useMe } from "@/lib/useMe";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Leaf, testid: "nav-home" },
  { to: "/scan", label: "Scan", icon: ScanLine, testid: "nav-scan" },
  { to: "/assistant", label: "Assistant", icon: MessageCircle, testid: "nav-assistant" },
  { to: "/facilities", label: "Facilities", icon: MapPin, testid: "nav-facilities" },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
    isActive ? "bg-emerald-700 text-white" : "text-emerald-900/70 hover:bg-emerald-900/5",
  );

export default function AppShell() {
  // The citizen app sits behind Emergent-managed sign-in (email + password or Google).
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();

  if (!isLoaded) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#0D1B13] text-emerald-50">
        <Recycle className="h-8 w-8 animate-pulse" aria-label="Loading" />
      </div>
    );
  }

  if (!isSignedIn) return <Navigate to="/sign-in" replace />;

  return (
    <>
      {(
        <div className="min-h-svh bg-background text-foreground">
          <header className="sticky top-0 z-40 border-b border-emerald-900/10 bg-white/85 backdrop-blur-xl">
            <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
                  <Recycle className="h-5 w-5" aria-hidden />
                </span>
                <div className="leading-tight">
                  <p className="font-heading text-base font-bold tracking-tight text-emerald-950">
                    Swachh Chiplun
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-800/70">
                    AI Waste Assistant · Ratnagiri
                  </p>
                </div>
              </div>
              <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
                {NAV.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navLinkClass} data-testid={item.testid}>
                    <item.icon className="mr-1.5 inline h-4 w-4" aria-hidden />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-900/15 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800 xl:inline-flex">
                  <Leaf className="h-3.5 w-3.5" aria-hidden />
                  Sahyadri Nisarg Mitra · Partner
                </span>
                {me.data?.role === "admin" && (
                  <NavLink
                    to="/admin"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0D1B13] px-2.5 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-900"
                    data-testid="nav-admin-panel"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Admin
                  </NavLink>
                )}
                <FeedbackDialog />
                <span data-testid="user-menu">
                  <UserButton />
                </span>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pb-12">
            <Outlet />
          </main>

          <nav
            className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-900/10 bg-white/95 backdrop-blur md:hidden"
            aria-label="Mobile navigation"
          >
            <div className="grid grid-cols-5 gap-1 px-2 py-2">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    cn(
                      "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium",
                      isActive ? "text-emerald-700" : "text-emerald-900/60",
                    )
                  }
                  data-testid={item.testid}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      )}
      <Toaster richColors position="bottom-right" />
    </>
  );
}