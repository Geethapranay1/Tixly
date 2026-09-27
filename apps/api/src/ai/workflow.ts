import type { PendingTicket, TicketSummary, WorkflowStatus } from "@tixly/shared";

export type ChatWorkflowResult = {
  status: WorkflowStatus;
  missingFields: string[];
  reply: string;
  draft: PendingTicket | null;
  shouldCreate: boolean;
  language: string | null;
};

export function toTicketSummary(ticket: {
  id: string;
  title: string;
  description: string | null;
  assigneeId: string | null;
  dueDate: Date | null;
  priority: string;
  status: string;
  tags: string[];
  language: string | null;
  creationSource: string;
  assignee?: { name: string } | null;
}): TicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    assigneeId: ticket.assigneeId,
    assigneeName: ticket.assignee?.name ?? null,
    dueDate: ticket.dueDate ? ticket.dueDate.toISOString().slice(0, 10) : null,
    priority: ticket.priority as TicketSummary["priority"],
    status: ticket.status as TicketSummary["status"],
    tags: ticket.tags,
    language: ticket.language,
    creationSource: ticket.creationSource as TicketSummary["creationSource"],
  };
}
