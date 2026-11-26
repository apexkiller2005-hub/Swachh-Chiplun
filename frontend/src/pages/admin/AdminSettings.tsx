import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { DemoDataCounts } from "@/lib/doorstepTypes";
import { PageHeader, useConfirm } from "@/components/admin/AdminUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PHRASE = "CLEAR DEMO";

export default function AdminSettings() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const counts = useQuery({ queryKey: ["demo-data-counts"], queryFn: () => apiGet<DemoDataCounts>("/admin/demo-data") });
  const [phrase, setPhrase] = useState("");
  const [sure, setSure] = useState(false);
  const clear = useMutation({
    mutationFn: () => apiPost<DemoDataCounts>("/admin/demo-data/clear", { phrase, confirm: sure }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.demo_users} demo users and ${r.demo_trips} demo trips`);
      setPhrase("");
      setSure(false);
      void qc.invalidateQueries({ queryKey: ["demo-data-counts"] });
      void qc.invalidateQueries({ queryKey: ["doorstep-state"] });
      void qc.invalidateQueries({ queryKey: ["doorstep-demo-users"] });
    },
    onError: (e) => toast.error(e instanceof ApiError || e instanceof Error ? e.message : "Could not clear demo data"),
  });
  const ready = phrase === PHRASE && sure && !clear.isPending;
  const c = counts.data;

  return (
    <div className="space-y-6">
      {dialog}
      <PageHeader title="Settings" subtitle="Admin settings for Swachh Chiplun." />

      <Card className="border-emerald-950/10">
        <CardContent className="pt-5 text-sm text-muted-foreground" data-testid="settings-general-info">
          The admin is the single verified email set in <code>ADMIN_EMAIL</code>. Categories, facilities and tips are managed from their own pages.
        </CardContent>
      </Card>

      <section className="rounded-2xl border-2 border-red-200 bg-red-50/50 p-5" data-testid="settings-danger-zone">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-red-800">
          <AlertTriangle className="h-5 w-5" aria-hidden /> Danger zone
        </h2>
        <div className="mt-3 space-y-3">
          <div>
            <p className="font-semibold text-red-950">Clear Doorstep demo data</p>
            <p className="text-sm text-red-900" data-testid="settings-demo-counts">
              This will delete <b>{c?.demo_users ?? "…"}</b> demo users and <b>{c?.demo_trips ?? "…"}</b> demo trips. Real users, their scans and their saved pickup spots are never touched.
            </p>
          </div>
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="clear-phrase">Type {PHRASE} to continue</Label>
            <Input id="clear-phrase" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" data-testid="settings-clear-phrase-input" />
          </div>
          <label className="flex items-center gap-2 text-sm text-red-950">
            <input type="checkbox" className="h-4 w-4 accent-red-700" checked={sure} onChange={(e) => setSure(e.target.checked)} data-testid="settings-clear-confirm-checkbox" />
            I understand this cannot be undone.
          </label>
          <Button
            variant="destructive"
            disabled={!ready}
            onClick={() => confirm(`Delete ${c?.demo_users ?? 0} demo users and ${c?.demo_trips ?? 0} demo trips?`, () => clear.mutate())}
            data-testid="settings-clear-demo-button"
          >
            Clear demo data
          </Button>
        </div>
      </section>
    </div>
  );
}
