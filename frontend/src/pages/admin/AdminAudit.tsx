import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { apiGet } from "@/lib/api";
import type { AuditEntry } from "@/lib/adminTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/AdminUi";

const ACTION_LABEL: Record<string, string> = {
  create_category: "Added category",
  update_category: "Edited category",
  delete_category: "Deleted category",
  create_facility: "Added facility",
  update_facility: "Edited facility",
  activate_facility: "Activated facility",
  deactivate_facility: "Deactivated facility",
  delete_facility: "Deleted facility",
  delete_record: "Deleted waste record",
  change_role: "Changed user role",
  reply_feedback: "Replied to feedback",
  delete_feedback: "Deleted feedback",
};

export default function AdminAudit() {
  const log = useQuery({ queryKey: ["admin", "audit"], queryFn: () => apiGet<AuditEntry[]>("/admin/audit?limit=200") });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change made in the admin panel — who did what, and when. It cannot be edited." />
      <Card className="border-emerald-950/10">
        <CardContent className="pt-5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(log.data ?? []).map((a) => (
                <TableRow key={a.id} data-testid={`audit-row-${a.id}`}>
                  <TableCell className="whitespace-nowrap text-emerald-950/60">{format(new Date(a.at), "dd MMM yyyy, HH:mm")}</TableCell>
                  <TableCell>{a.admin_email}</TableCell>
                  <TableCell className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</TableCell>
                  <TableCell className="max-w-72 truncate">{a.target}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {log.data?.length === 0 && (
            <p className="py-6 text-center text-sm text-emerald-950/60" data-testid="audit-empty">No admin actions yet.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
