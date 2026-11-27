import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";
import { Recycle } from "lucide-react";

import { API_BASE } from "@/lib/api";

// Brand Clerk once: it styles sign-in, sign-up and the user menu.
const appearance = {
  variables: {
    colorPrimary: "#15803d",
    colorForeground: "#13261b",
    fontFamily: "'Plus Jakarta Sans Variable', sans-serif",
    borderRadius: "0.75rem",
  },
};

interface ClerkConfig {
  enabled: boolean;
  publishable_key: string;
  proxy_url: string;
}

// A free Render service sleeps after ~15 minutes and takes 30-60s to wake up.
// Retry long enough to cover that, so the first visitor of the day is not
// greeted with "Sign-in is unavailable".
const RETRY_MS = 2000;
const MAX_ATTEMPTS = 45;
const REQUEST_TIMEOUT_MS = 12_000;

type Failure = "timeout" | "missing" | "config";

const FAILURE_TEXT: Record<Failure, { title: string; body: string }> = {
  timeout: {
    title: "Cannot reach the server",
    body: "The API may still be waking up (free hosting sleeps when idle). Wait a few seconds, then try again.",
  },
  missing: {
    title: "API route not found (404)",
    body: "The frontend is not reaching the backend. On Vercel, check that frontend/vercel.json rewrites /api/* to your Render URL.",
  },
  config: {
    title: "Sign-in is not configured",
    body: "The server is reachable but CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY are missing on the backend. Add them on Render and redeploy.",
  },
};

// Starts Clerk from the backend's runtime config, so deploy's live keys need no rebuild.
// Must render inside <BrowserRouter> so Clerk navigates without reloading.
export default function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ClerkConfig | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setFailure(null);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // A test-instance key works on any origin without the Clerk proxy, so start
    // immediately instead of waiting for the API. Live keys MUST come from the
    // backend: they need the /api/__clerk proxy URL.
    const envKey = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim();
    if (envKey?.startsWith("pk_test_")) {
      setConfig({ enabled: true, publishable_key: envKey, proxy_url: "" });
      return;
    }

    const load = async (attempt: number) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const res = await fetch(`${API_BASE}/clerk/config`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const cfg = (await res.json()) as ClerkConfig;
          if (cfg.enabled && cfg.publishable_key) {
            if (!cancelled) setConfig(cfg);
            return;
          }
          // Reachable, but the backend has no Clerk keys: retrying will not help.
          if (!cancelled) setFailure("config");
          return;
        }
        if (res.status === 404) {
          // No /api rewrite (or the wrong backend path): retrying will not help.
          if (!cancelled) setFailure("missing");
          return;
        }
      } catch {
        // backend asleep / restarting / offline — retry below
      }
      if (cancelled) return;
      if (attempt + 1 >= MAX_ATTEMPTS) {
        setFailure("timeout");
        return;
      }
      timer = setTimeout(() => load(attempt + 1), RETRY_MS);
    };

    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reloadKey]);

  if (failure) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#0D1B13] px-6 text-center text-emerald-50">
        <Recycle className="h-8 w-8 text-emerald-400" aria-hidden />
        <div>
          <p className="font-semibold">{FAILURE_TEXT[failure].title}</p>
          <p className="mt-1 max-w-sm text-sm text-emerald-100/70">{FAILURE_TEXT[failure].body}</p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-[#0D1B13] text-emerald-50">
        <Recycle className="h-8 w-8 animate-pulse text-emerald-400" aria-label="Loading" />
        <p className="text-sm text-emerald-100/70">Connecting to the server…</p>
      </div>
    );
  }

  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={appearance}
      routerPush={(to: string) => navigate(to)}
      routerReplace={(to: string) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}
