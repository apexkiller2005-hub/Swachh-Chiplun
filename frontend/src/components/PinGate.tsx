import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Delete, Recycle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { apiPost } from "@/lib/api";
import type { GateStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export default function PinGate() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const qc = useQueryClient();

  const unlock = useMutation({
    mutationFn: (candidate: string) => apiPost<GateStatus>("/gate/unlock", { pin: candidate }),
    onSuccess: (data) => {
      if (data.unlocked) {
        qc.invalidateQueries({ queryKey: ["gate"] });
        toast.success("Demo unlocked — welcome!");
      } else {
        setError(true);
        setPin("");
      }
    },
    onError: () => {
      setError(true);
      setPin("");
    },
  });

  const press = (key: string) => {
    setError(false);
    if (key === "clear") return setPin("");
    if (key === "back") return setPin((p) => p.slice(0, -1));
    const next = (pin + key).slice(0, 4);
    setPin(next);
    if (next.length === 4) unlock.mutate(next);
  };

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-[#0D1B13] px-4 py-10 text-emerald-50">
      <img
        src="https://images.pexels.com/photos/35775956/pexels-photo-35775956.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0D1B13]/85 to-[#0D1B13]/95" />

      <div className="relative z-10 grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-emerald-950">
            <Recycle className="h-7 w-7" aria-hidden />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
            Student project · Chiplun, Ratnagiri
          </p>
          <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight">
            Swachh Chiplun
          </h1>
          <p className="mt-3 max-w-md leading-relaxed text-emerald-100/85">
            AI-Based Smart Waste Identification &amp; Disposal Assistant — snap a photo of any
            waste item to classify it, learn safe disposal under Indian rules, and find the
            nearest proper facility on the map.
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Built for a deployment path with Sahyadri Nisarg Mitra
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-400/15 bg-white/5 p-6 backdrop-blur">
          <h2 className="font-heading text-lg font-bold" data-testid="gate-title">
            Demo access
          </h2>
          <p className="mt-1 text-sm text-emerald-100/70">
            Enter the 4-digit PIN to open your project.
          </p>
          <div className="mt-5 flex justify-center gap-3" aria-label="PIN progress">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                data-testid={`gate-pin-dot-${i}`}
                className={cn(
                  "h-3.5 w-3.5 rounded-full border border-emerald-300/50",
                  pin.length > i ? "bg-emerald-400" : "bg-transparent",
                )}
              />
            ))}
          </div>
          {error && (
            <p className="mt-4 text-center text-sm font-medium text-red-300" data-testid="gate-error">
              Wrong PIN — try again.
            </p>
          )}
          <div className="mt-6 grid grid-cols-3 gap-3">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                disabled={unlock.isPending}
                aria-label={key === "back" ? "Delete last digit" : key === "clear" ? "Clear PIN" : key}
                data-testid={`gate-key-${key}`}
                className="flex h-14 items-center justify-center rounded-xl border border-emerald-400/15 bg-emerald-400/5 font-heading text-xl font-semibold text-emerald-50 transition hover:border-emerald-300/40 hover:bg-emerald-400/15 active:scale-95"
              >
                {key === "back" ? <Delete className="h-5 w-5" aria-hidden /> : key === "clear" ? "C" : key}
              </button>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-emerald-100/60">
            Demo PIN hint: <span className="font-semibold text-emerald-200">2026</span>
          </p>
        </div>
      </div>
    </div>
  );
}