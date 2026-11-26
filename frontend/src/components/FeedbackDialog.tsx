import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

import { apiGet, apiPost } from "@/lib/api";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type Feedback,
  type FeedbackIn,
  type FeedbackKind,
} from "@/lib/adminTypes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Citizen "Send feedback" — the only addition to the citizen header. Shows the
// person's earlier feedback with the town admin's replies.
export default function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("complaint");
  const [message, setMessage] = useState("");
  const qc = useQueryClient();

  const mine = useQuery({
    queryKey: ["feedback", "mine"],
    queryFn: () => apiGet<Feedback[]>("/feedback/mine"),
    enabled: open,
  });

  const send = useMutation({
    mutationFn: (body: FeedbackIn) => apiPost<Feedback>("/feedback", body),
    onSuccess: () => {
      setMessage("");
      qc.invalidateQueries({ queryKey: ["feedback", "mine"] });
      toast.success("Thank you — your feedback reached the Chiplun admin");
    },
    onError: () => toast.error("Could not send feedback — try again"),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="feedback-open-button">
        <MessageSquarePlus className="mr-1 h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Feedback</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" data-testid="feedback-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Send feedback or a complaint</DialogTitle>
            <DialogDescription>
              Report a problem, a closed facility, or suggest an improvement. The town admin replies here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={kind} onValueChange={(v: string) => setKind(v as FeedbackKind)}>
              <SelectTrigger className="w-full" data-testid="feedback-kind-select">
                <SelectValue>{(v: string) => FEEDBACK_KINDS.find((k) => k.value === v)?.label ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_KINDS.map((k) => (
                  <SelectItem key={k.value} value={k.value} data-testid={`feedback-kind-${k.value}`}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. The e-waste centre near Shivaji Nagar was closed on Saturday."
              rows={4}
              data-testid="feedback-message-input"
            />
            <Button
              className="w-full"
              disabled={send.isPending || message.trim().length < 3}
              onClick={() => send.mutate({ kind, message: message.trim() })}
              data-testid="feedback-submit-button"
            >
              {send.isPending ? "Sending…" : "Send feedback"}
            </Button>
          </div>

          <div className="mt-2 border-t border-emerald-950/10 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Your earlier feedback</p>
            {mine.isLoading && <p className="mt-2 text-sm text-emerald-950/60">Loading…</p>}
            {mine.data?.length === 0 && (
              <p className="mt-2 text-sm text-emerald-950/60" data-testid="feedback-mine-empty">
                Nothing sent yet.
              </p>
            )}
            <div className="mt-2 space-y-2">
              {mine.data?.map((f) => {
                const st = FEEDBACK_STATUSES.find((s) => s.value === f.status);
                return (
                  <div key={f.id} className="rounded-xl border border-emerald-950/10 bg-[#F4F7F4] p-3" data-testid={`feedback-mine-${f.id}`}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-emerald-900">
                        {FEEDBACK_KINDS.find((k) => k.value === f.kind)?.label} · {format(new Date(f.created_at), "dd MMM")}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${st?.cls ?? ""}`}>{st?.label}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-emerald-950/80">{f.message}</p>
                    {f.admin_reply && (
                      <p className="mt-2 rounded-lg bg-white p-2 text-sm text-emerald-900" data-testid={`feedback-reply-${f.id}`}>
                        <span className="font-semibold">Admin reply:</span> {f.admin_reply}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
