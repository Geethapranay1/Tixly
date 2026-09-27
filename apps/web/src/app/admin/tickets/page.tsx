"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Ticket = {
  id: string;
  title: string;
  assigneeName?: string | null;
  dueDate?: string | null;
  priority: string;
  status: string;
};

type Assignee = { id: string; name: string; team: string | null };

const PAGE_SIZE = 20;

function priorityVariant(priority: string) {
  switch (priority) {
    case "URGENT":
      return "danger" as const;
    case "HIGH":
      return "warning" as const;
    case "LOW":
      return "secondary" as const;
    default:
      return "default" as const;
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "RESOLVED":
      return "success" as const;
    case "IN_PROGRESS":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [assigneeId, setAssigneeId] = useState("all");
  const [dueBefore, setDueBefore] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const token = localStorage.getItem("tixly_admin_token");
    if (!token) return;
    void apiFetch<{ users: Assignee[] }>("/api/users", { token })
      .then((data) => setAssignees(data.users))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = localStorage.getItem("tixly_admin_token");
      if (!token) return;
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (status !== "all") params.set("status", status);
      if (priority !== "all") params.set("priority", priority);
      if (assigneeId !== "all") params.set("assigneeId", assigneeId);
      if (dueBefore) params.set("dueBefore", dueBefore);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      setLoading(true);
      try {
        const data = await apiFetch<{ tickets: Ticket[]; total: number }>(
          `/api/tickets?${params.toString()}`,
          { token },
        );
        if (!cancelled) {
          setTickets(data.tickets);
          setTotal(data.total);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, status, priority, assigneeId, dueBefore, page]);

  return (
    <AdminShell title="Tickets">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={priority}
          onValueChange={(value) => {
            setPriority(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={assigneeId}
          onValueChange={(value) => {
            setAssigneeId(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            {assignees.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.team ? `${user.name} (${user.team})` : user.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Due by
          <Input
            type="date"
            value={dueBefore}
            onChange={(e) => {
              setDueBefore(e.target.value);
              setPage(1);
            }}
            className="w-[160px]"
            aria-label="Due by"
          />
        </label>
        {loading && (
          <span className="text-sm text-muted-foreground">Filtering…</span>
        )}
      </div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Title</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <Link
                    href={`/admin/tickets/${t.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {t.title}
                  </Link>
                </TableCell>
                <TableCell>{t.assigneeName || "—"}</TableCell>
                <TableCell>{t.dueDate || "—"}</TableCell>
                <TableCell>
                  <Badge variant={priorityVariant(t.priority)}>
                    {t.priority}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {tickets.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  No tickets found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {Math.ceil(total / PAGE_SIZE)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(total / PAGE_SIZE)}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </AdminShell>
  );
}
