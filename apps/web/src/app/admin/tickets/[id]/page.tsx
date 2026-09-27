"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type TicketDetail = {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  assigneeName?: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  tags: string[];
  language: string | null;
  creationSource: string;
  originalMessage: string | null;
  detectedLanguage: string | null;
};

type User = { id: string; name: string };

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const token = localStorage.getItem("tixly_admin_token");
    if (!token) return;
    try {
      const [t, u] = await Promise.all([
        apiFetch<{ ticket: TicketDetail }>(`/api/tickets/${params.id}`, {
          token,
        }),
        apiFetch<{ users: User[] }>("/api/users", { token }),
      ]);
      setTicket(t.ticket);
      setUsers(u.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function onSave(e?: FormEvent) {
    e?.preventDefault();
    if (!ticket || saving) return;
    const token = localStorage.getItem("tixly_admin_token");
    if (!token) {
      toast.error("Not signed in");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ ticket: TicketDetail }>(
        `/api/tickets/${ticket.id}`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            title: ticket.title,
            description: ticket.description,
            assigneeId: ticket.assigneeId,
            dueDate: ticket.dueDate,
            priority: ticket.priority,
            status: ticket.status,
            tags: ticket.tags,
          }),
        },
      );
      setTicket((prev) =>
        prev ? { ...prev, ...res.ticket } : { ...ticket, ...res.ticket },
      );
      toast.success("Ticket saved", {
        description: ticket.title,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      toast.error("Couldn’t save ticket", { description: message });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!ticket || !confirm("Delete this ticket?")) return;
    const token = localStorage.getItem("tixly_admin_token");
    if (!token) return;
    try {
      await apiFetch(`/api/tickets/${ticket.id}`, { method: "DELETE", token });
      toast.success("Ticket deleted");
      router.push("/admin/tickets");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setError(message);
      toast.error("Couldn’t delete ticket", { description: message });
    }
  }

  if (!ticket) {
    return (
      <AdminShell title="Ticket" backHref="/admin/tickets" backLabel="Back to tickets">
        <p className="text-muted-foreground">{error || "Loading…"}</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title={ticket.title}
      backHref="/admin/tickets"
      backLabel="Back to tickets"
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <form onSubmit={(e) => void onSave(e)} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={ticket.title}
                onChange={(e) => setTicket({ ...ticket, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={4}
                value={ticket.description || ""}
                onChange={(e) =>
                  setTicket({ ...ticket, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={ticket.status}
                onValueChange={(v) => setTicket({ ...ticket, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={ticket.priority}
                onValueChange={(v) => setTicket({ ...ticket, priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select
                value={ticket.assigneeId || "none"}
                onValueChange={(v) =>
                  setTicket({
                    ...ticket,
                    assigneeId: v === "none" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={ticket.dueDate || ""}
                onChange={(e) =>
                  setTicket({ ...ticket, dueDate: e.target.value || null })
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                disabled={saving}
                onClick={(e) => {
                  e.preventDefault();
                  void onSave();
                }}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => void onDelete()}
              >
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Context</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-muted-foreground">Creation source</div>
              <div className="font-medium">
                {ticket.creationSource === "CHAT"
                  ? "Chat"
                  : ticket.creationSource}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Detected language</div>
              <div className="font-medium">
                {ticket.detectedLanguage || ticket.language || "—"}
              </div>
            </div>
            <div>
              <div className="mb-1 text-muted-foreground">
                Original chat message
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-[13px]">
                {ticket.originalMessage || "—"}
              </pre>
            </div>
            <div>
              <div className="text-muted-foreground">Tags</div>
              <div>{ticket.tags?.length ? ticket.tags.join(", ") : "—"}</div>
            </div>
          </CardContent>
        </Card>
      </form>
    </AdminShell>
  );
}
