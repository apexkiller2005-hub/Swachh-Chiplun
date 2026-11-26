import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/react";

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

// Starts Clerk from the backend's runtime config, so deploy's live keys need no rebuild.
// Must render inside <BrowserRouter> so Clerk navigates without reloading.
export default function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ClerkConfig | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // Retries while the backend restarts: Clerk components crash without <ClerkProvider>.
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const cfg = (await (await fetch(`${API_BASE}/clerk/config`)).json()) as ClerkConfig;
        if (cfg.enabled) {
          if (!cancelled) setConfig(cfg);
          return;
        }
      } catch {
        // backend restarting — retry below
      }
      if (cancelled) return;
      if (attempt >= 20) {
        // Fallback: publishable key from frontend/.env (safe in the browser).
        const envKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
        if (envKey) {
          setConfig({ enabled: true, publishable_key: envKey, proxy_url: "" });
          return;
        }
        setUnavailable(true);
        return;
      }
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable) return <p style={{ padding: 24 }}>Sign-in is unavailable right now. Refresh the page to try again.</p>;
  if (!config) return null;
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
