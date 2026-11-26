import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ExternalLink, Info, Search, ShieldCheck } from "lucide-react";

import { apiGet } from "@/lib/api";
import type { UserRow, UsersResponse } from "@/lib/adminTypes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/AdminUi";

// Clerk dashboard deep link — block / unblock / delete the sign-in account there (free).
const clerkUserUrl = (id: string) => `https://dashboard.clerk.com/last-active?path=users/${id}`;

export default function AdminUsers() {
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => apiGet<UsersResponse>("/admin/users") });
  const [q, setQ] = useState("");
  const [viewing, setViewing] = useState<UserRow | null>(null);

  const needle = q.trim().toLowerCase();
  const rows = (users.data?.users ?? []).filter(
    (u) => !needle || u.email.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle),
  );

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone who signed in to Swachh Chiplun, with their activity." />

      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="flex items-start gap-3 pt-5 text-sm text-amber-900" data-testid="users-block-info">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">Block, unblock or delete a user:</span> open the user and press{" "}
            <span className="font-semibold">Open in Clerk</span>. Clerk (the sign-in service) blocks them everywhere with one
            click. There is exactly one admin (ADMIN_EMAIL), so there is no "make admin" option.
          </p>
        </CardContent>
      </Card>

      <Card className="border-emerald-950/10">
        <CardContent className="pt-5">
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-emerald-950/40" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="pl-8" data-testid="users-search-input" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Scans</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((u) => (
                <TableRow key={u.user_id} data-testid={`user-row-${u.user_id}`}>
                  <TableCell>
                    <p className="font-medium">{u.name || u.email}</p>
                    <p className="text-xs text-emerald-950/55">{u.email}</p>
                  </TableCell>
                  <TableCell data-testid={`user-role-${u.user_id}`}>
                    {u.role === "admin" ? (
                      <Badge className="bg-emerald-700 text-white"><ShieldCheck className="mr-1 h-3 w-3" aria-hidden />Admin</Badge>
                    ) : (
                      <Badge variant="secondary">User</Badge>
                    )}
                  </TableCell>
                  <TableCell data-testid={`user-scan-count-${u.user_id}`}>{u.scan_count}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-950/60">{u.created_at ? format(new Date(u.created_at), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-emerald-950/60">{u.last_seen ? formatDistanceToNow(new Date(u.last_seen), { addSuffix: true }) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setViewing(u)} data-testid={`user-view-${u.user_id}`}>
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.data && rows.length === 0 && <p className="py-6 text-center text-sm text-emerald-950/60" data-testid="users-empty">No users match.</p>}
        </CardContent>
      </Card>

      <Dialog open={viewing !== null} onOpenChange={(o: boolean) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-md" data-testid="user-detail-dialog">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">{viewing.name || viewing.email}</DialogTitle>
              </DialogHeader>
              <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
                <dt className="text-emerald-950/55">Email</dt><dd>{viewing.email}</dd>
                <dt className="text-emerald-950/55">Role</dt><dd>{viewing.role === "admin" ? "Admin (ADMIN_EMAIL)" : "User"}</dd>
                <dt className="text-emerald-950/55">Scans</dt><dd>{viewing.scan_count}</dd>
                <dt className="text-emerald-950/55">Feedback</dt><dd>{viewing.feedback_count}</dd>
                <dt className="text-emerald-950/55">Joined</dt><dd>{viewing.created_at ? format(new Date(viewing.created_at), "dd MMM yyyy, HH:mm") : "—"}</dd>
                <dt className="text-emerald-950/55">User ID</dt><dd className="break-all font-mono text-xs">{viewing.user_id}</dd>
              </dl>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button render={<Link to={`/admin/records?user=${viewing.user_id}`} />} data-testid="user-detail-scans">
                  View scan history
                </Button>
                <Button
                  variant="outline"
                  render={<a href={clerkUserUrl(viewing.user_id)} target="_blank" rel="noopener noreferrer" />}
                  data-testid="user-detail-open-clerk"
                >
                  Open in Clerk (block / delete) <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
