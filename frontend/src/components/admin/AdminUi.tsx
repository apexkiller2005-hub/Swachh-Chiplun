import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-emerald-950" data-testid="admin-page-title">
          {title}
        </h1>
        <p className="mt-1 text-sm text-emerald-950/60">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, testid }: { label: string; value: ReactNode; hint?: string; testid: string }) {
  return (
    <Card size="sm" className="border-emerald-950/10" data-testid={testid}>
      <CardContent className="pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800/70">{label}</p>
        <p className="mt-2 font-heading text-3xl font-bold text-emerald-950">{value}</p>
        {hint && <p className="mt-1 text-xs text-emerald-950/55">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function CategoryPill({ label, color, testid }: { label: string; color: string; testid?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: `${color}1A`, color, borderColor: `${color}55` }}
      data-testid={testid}
    >
      {label}
    </span>
  );
}

// Confirmation for destructive admin actions (delete record / category / facility / feedback).
export function useConfirm() {
  const [state, setState] = useState<{ text: string; onYes: () => void } | null>(null);
  const confirm = (text: string, onYes: () => void) => setState({ text, onYes });
  const dialog = (
    <Dialog open={state !== null} onOpenChange={(o: boolean) => !o && setState(null)}>
      <DialogContent className="sm:max-w-md" data-testid="confirm-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Are you sure?</DialogTitle>
          <DialogDescription>{state?.text}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setState(null)} data-testid="confirm-cancel-button">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              state?.onYes();
              setState(null);
            }}
            data-testid="confirm-yes-button"
          >
            Yes, delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { confirm, dialog };
}

export const lines = (text: string) => text.split("\n").map((s) => s.trim()).filter(Boolean);
export const commas = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);
