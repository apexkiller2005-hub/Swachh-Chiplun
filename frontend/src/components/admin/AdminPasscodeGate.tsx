import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";

import { apiPost } from "@/lib/api";
import { errorMessage, type AdminGate, type PasscodeIn } from "@/lib/adminTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Second lock: shown when ADMIN_PASSCODE is set and this sign-in session is not unlocked yet.
export default function AdminPasscodeGate({ gate }: { gate: AdminGate }) {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();

  const unlock = useMutation({
    mutationFn: (body: PasscodeIn) => apiPost<AdminGate>("/admin/unlock", body),
    onSuccess: () => {
      setPasscode("");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => {
      setPasscode("");
      setError(errorMessage(e, "Wrong passcode."));
    },
  });

  const locked = gate.locked_until !== null;

  return (
    <div className="flex min-h-svh items-center justify-center bg-[#0D1B13] px-4">
      <form
        className="w-full max-w-sm rounded-2xl border border-emerald-400/15 bg-white/5 p-6 text-emerald-50 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          if (passcode) unlock.mutate({ passcode });
        }}
        data-testid="admin-passcode-gate"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-xl font-bold">Admin passcode</h1>
        <p className="mt-1 text-sm text-emerald-100/70">
          Signed in as {gate.admin_email}. Enter the admin passcode once for this session.
        </p>
        <Input
          type="password"
          autoComplete="current-password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          disabled={locked || unlock.isPending}
          className="mt-4 bg-white text-emerald-950"
          placeholder="Passcode"
          data-testid="admin-passcode-input"
        />
        {(error || locked) && (
          <p className="mt-3 text-sm font-medium text-red-300" data-testid="admin-passcode-error">
            {locked ? "Too many wrong attempts. Try again in 15 minutes." : error}
          </p>
        )}
        <Button type="submit" className="mt-4 w-full" disabled={locked || unlock.isPending || !passcode} data-testid="admin-passcode-submit">
          {unlock.isPending ? "Checking…" : "Unlock admin panel"}
        </Button>
        <Link to="/" className="mt-4 block text-center text-xs text-emerald-300 hover:underline" data-testid="admin-passcode-back">
          ← Back to Swachh Chiplun
        </Link>
      </form>
    </div>
  );
}
