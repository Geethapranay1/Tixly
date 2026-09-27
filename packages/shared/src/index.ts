import { z } from "zod";

export const PrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export type Priority = z.infer<typeof PrioritySchema>;

export const TicketStatusSchema = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const CreationSourceSchema = z.enum(["CHAT"]);
export type CreationSource = z.infer<typeof CreationSourceSchema>;

export const WorkflowStatusSchema = z.enum([
  "complete",
  "needs_clarification",
  "cancelled",
  "non_ticket",
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;

export const IntentSchema = z.enum([
  "ticket",
  "clarification_reply",
  "cancel",
  "non_ticket",
]);
export type Intent = z.infer<typeof IntentSchema>;

export const ExtractionResultSchema = z.object({
  intent: IntentSchema,
  language: z.string(),
  issueSummary: z.string().nullable(),
  issueSummaryEn: z.string().nullable(),
  description: z.string().nullable(),
  assigneeMention: z.string().nullable(),
  assigneeMentionLatin: z.string().nullable(),
  dueDateMention: z.string().nullable(),
  dueDateMentionEn: z.string().nullable(),
  priority: PrioritySchema.nullable(),
  tags: z.array(z.string()),
  explicitUnassigned: z.boolean(),
  explicitNoDeadline: z.boolean(),
  confirmsProposedDate: z.boolean().nullable(),
  clarifiedMonth: z.string().nullable(),
  reply: z.string(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const AssigneeStatusSchema = z.enum([
  "resolved",
  "ambiguous",
  "missing",
  "explicit_none",
]);
export type AssigneeStatus = z.infer<typeof AssigneeStatusSchema>;

export const DueDateStatusSchema = z.enum([
  "resolved",
  "proposed",
  "ambiguous",
  "missing",
  "explicit_none",
]);
export type DueDateStatus = z.infer<typeof DueDateStatusSchema>;

export const AssigneeCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  team: z.string().nullable().optional(),
});

export const PendingTicketSchema = z.object({
  issueSummaryEn: z.string().nullable(),
  description: z.string().nullable(),
  language: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeStatus: AssigneeStatusSchema,
  assigneeCandidates: z.array(AssigneeCandidateSchema).optional(),
  dueDate: z.string().nullable(),
  proposedDueDate: z.string().nullable(),
  dueDateStatus: DueDateStatusSchema,
  priority: PrioritySchema,
  tags: z.array(z.string()),
  sourceMessageId: z.string().optional(),
});
export type PendingTicket = z.infer<typeof PendingTicketSchema>;

export function emptyPendingTicket(): PendingTicket {
  return {
    issueSummaryEn: null,
    description: null,
    language: null,
    assigneeId: null,
    assigneeStatus: "missing",
    assigneeCandidates: [],
    dueDate: null,
    proposedDueDate: null,
    dueDateStatus: "missing",
    priority: "MEDIUM",
    tags: [],
  };
}

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const ChatMessageBodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  content: z.string().min(1).max(8000),
  timeZone: z.string().min(1).max(100).optional(),
});

export const CreateUserBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  team: z.string().optional(),
});

export const UpdateTicketBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  priority: PrioritySchema.optional(),
  status: TicketStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const TicketSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable().optional(),
  dueDate: z.string().nullable(),
  priority: PrioritySchema,
  status: TicketStatusSchema,
  tags: z.array(z.string()),
  language: z.string().nullable(),
  creationSource: CreationSourceSchema,
});
export type TicketSummary = z.infer<typeof TicketSummarySchema>;
