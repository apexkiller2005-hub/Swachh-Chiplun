import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type DeleteResult,
  type Feedback,
  type FeedbackReplyIn,
  type FeedbackStatus,
} from "@/lib/adminTypes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, useConfirm } from "@/components/admin/AdminUi";
import { cn } from "@/lib/utils";

const FILTERS: { value: "" | FeedbackStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
];

export default function AdminFeedback() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<"" | FeedbackStatus>("");
  const [replying, setReplying] = useState<Feedback | null>(null);
  const [status, setStatus] = useState<FeedbackStatus>("in_progress");
  const [reply, setReply] = useState("");

  const list = useQuery({
    queryKey: ["admin", "feedback", filter],
    queryFn: () => apiGet<Feedback[]>(`/admin/feedback${filter ? `?status=${filter}` : ""}`),
  });

  const save = useMutation({
    mutationFn: ({ id, body }: { id: string; body: FeedbackReplyIn }) => apiPatch<Feedback>(`/admin/feedback/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      setReplying(null);
      toast.success("Reply saved — the citizen sees it in their Feedback window");
    },
    onError: () => toast.error("Could not save the reply"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete<DeleteResult>(`/admin/feedback/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success("Feedback deleted");
    },
    onError: () => toast.error("Could not delete"),
  });

  const openReply = (f: Feedback) => {
    setReplying(f);
    setStatus(f.status === "open" ? "in_progress" : f.status);
    setReply(f.admin_reply);
  };

  return (
    <>
      <PageHeader title="Feedback & complaints" subtitle="Messages citizens send with the Feedback button. Reply and track each one to resolution." />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter feedback by status">
        {FILTERS.map((f) => (
          <button
            key={f.value || "all"}
            type="button"
            onClick={() => setFilter(f.value)}
            data-testid={`feedback-filter-${f.value || "all"}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
              filter === f.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-emerald-900/15 bg-white text-emerald-800 hover:bg-emerald-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.isLoading && <p className="text-sm text-emerald-950/60">Loading…</p>}
      {list.data?.length === 0 && (
        <Card className="border-dashed border-emerald-950/15">
          <CardContent className="py-10 text-center text-sm text-emerald-950/60" data-testid="admin-feedback-empty">
            No feedback here yet. Citizens send it with the Feedback button in the app header.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(list.data ?? []).map((f) => {
          const st = FEEDBACK_STATUSES.find((s) => s.value === f.status);
          return (
            <Card key={f.id} className="border-emerald-950/10" data-testid={`admin-feedback-card-${f.id}`}>
              <CardContent className="space-y-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-emerald-700/10 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {FEEDBACK_KINDS.find((k) => k.value === f.kind)?.label}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${st?.cls ?? ""}`} data-testid={`admin-feedback-status-${f.id}`}>
                      {st?.label}
                    </span>
                    <span className="text-emerald-950/60">{f.user_name || f.user_email} · {format(new Date(f.created_at), "dd MMM yyyy, HH:mm")}</span>
                  </div>
                  <div className="flex">
                    <Button size="sm" variant="outline" onClick={() => openReply(f)} data-testid={`admin-feedback-reply-${f.id}`}>
                      <Reply className="mr-1 h-3.5 w-3.5" aria-hidden /> Reply / update
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete feedback"
                      onClick={() => confirm("Delete this feedback permanently?", () => remove.mutate(f.id))}
                      data-testid={`admin-feedback-delete-${f.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-emerald-950/85">{f.message}</p>
                {f.admin_reply && (
                  <p className="rounded-lg bg-[#F4F7F4] p-2.5 text-sm text-emerald-900" data-testid={`admin-feedback-saved-reply-${f.id}`}>
                    <span className="font-semibold">Your reply:</span> {f.admin_reply}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={replying !== null} onOpenChange={(o: boolean) => !o && setReplying(null)}>
        <DialogContent className="sm:max-w-lg" data-testid="feedback-reply-dialog">
          <DialogHeader>
            <DialogTitle className="font-heading">Reply to {replying?.user_name || replying?.user_email}</DialogTitle>
          </DialogHeader>
          <p className="rounded-lg bg-[#F4F7F4] p-3 text-sm">{replying?.message}</p>
          <Select value={status} onValueChange={(v: string) => setStatus(v as FeedbackStatus)}>
            <SelectTrigger className="w-full" data-testid="feedback-reply-status-select">
              <SelectValue>{(v: string) => FEEDBACK_STATUSES.find((s) => s.value === v)?.label ?? v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FEEDBACK_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value} data-testid={`feedback-reply-status-${s.value}`}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write your reply to the citizen…" data-testid="feedback-reply-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplying(null)} data-testid="feedback-reply-cancel">Cancel</Button>
            <Button
              disabled={save.isPending}
              onClick={() => replying && save.mutate({ id: replying.id, body: { status, admin_reply: reply.trim() } })}
              data-testid="feedback-reply-save"
            >
              {save.isPending ? "Saving…" : "Save reply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
