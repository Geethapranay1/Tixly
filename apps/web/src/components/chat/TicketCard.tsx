import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TicketCardData = {
  id: string;
  title: string;
  assigneeName?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  priority: string;
  status?: string;
};

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

export function TicketCard({ ticket }: { ticket: TicketCardData }) {
  const status = ticket.status || "OPEN";

  return (
    <Card className="overflow-hidden border-primary/40 bg-accent/40 shadow-none">
      <div className="h-1 bg-primary" />
      <CardHeader className="space-y-2 p-4 pb-2">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
          Ticket created
        </p>
        <CardTitle className="text-base leading-snug">
          <span className="text-muted-foreground">#{ticket.id.slice(0, 8)}</span>
          <span className="mx-1.5 text-muted-foreground">·</span>
          {ticket.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={priorityVariant(ticket.priority)}>
            {ticket.priority}
          </Badge>
          <Badge variant={statusVariant(status)}>{status}</Badge>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-muted-foreground">Assignee</dt>
            <dd className="font-medium">{ticket.assigneeName || "Unassigned"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="font-medium">{ticket.dueDate || "No deadline"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
