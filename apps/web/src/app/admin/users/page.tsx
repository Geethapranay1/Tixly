"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type User = {
  id: string;
  name: string;
  email: string;
  team: string | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [team, setTeam] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = localStorage.getItem("tixly_admin_token");
    if (!token) return;
    const data = await apiFetch<{ users: User[] }>("/api/users", { token });
    setUsers(data.users);
  }

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Failed to load"),
    );
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("tixly_admin_token");
    if (!token) return;
    try {
      await apiFetch("/api/users", {
        method: "POST",
        token,
        body: JSON.stringify({ name, email, team: team || undefined }),
      });
      setName("");
      setEmail("");
      setTeam("");
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user");
    }
  }

  return (
    <AdminShell title="Assignable users">
      <Card className="mb-6">
        <CardContent className="pt-5">
          <form
            onSubmit={onAdd}
            className="grid gap-3 md:grid-cols-4"
          >
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              placeholder="Team (optional)"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
            />
            <Button type="submit">Add user</Button>
          </form>
        </CardContent>
      </Card>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Team</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.team || "—"}</TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-muted-foreground"
                >
                  No users yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </AdminShell>
  );
}
