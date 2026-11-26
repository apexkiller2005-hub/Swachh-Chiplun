import { Navigate, useSearchParams } from "react-router-dom";
import { SignIn, SignUp, useAuth } from "@clerk/react";
import { Recycle, ShieldCheck } from "lucide-react";

// Same-origin redirect target (e.g. /admin) from ?redirect_url=..., else the citizen home.
function safeTarget(raw: string | null): string {
  if (!raw) return "/";
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

export default function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [params] = useSearchParams();
  const target = safeTarget(params.get("redirect_url"));

  if (isLoaded && isSignedIn) return <Navigate to={target} replace />;

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[#0D1B13] text-emerald-50 lg:flex lg:flex-col lg:justify-center lg:px-14">
        <img
          src="https://images.pexels.com/photos/35775956/pexels-photo-35775956.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1B13]/80 to-[#0D1B13]/95" />
        <div className="relative z-10 max-w-md">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-emerald-950">
            <Recycle className="h-7 w-7" aria-hidden />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Chiplun, Ratnagiri district
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight">Swachh Chiplun</h1>
          <p className="mt-3 leading-relaxed text-emerald-100/85">
            AI-Based Smart Waste Identification &amp; Disposal Assistant. Sign in to scan waste, get
            safe disposal steps and find the nearest facility.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Built with Sahyadri Nisarg Mitra in mind
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 bg-[#F4F7F4] px-4 py-10" data-testid={`${mode}-page`}>
        <div className="flex items-center gap-2 lg:hidden">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <Recycle className="h-5 w-5" aria-hidden />
          </span>
          <p className="font-heading text-lg font-bold text-emerald-950">Swachh Chiplun</p>
        </div>
        {mode === "sign-in" ? (
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            withSignUp
            forceRedirectUrl={target}
          />
        ) : (
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl={target} />
        )}
      </div>
    </div>
  );
}
