import type { FastifyInstance } from "fastify";
import { UpdateTicketBodySchema, PrioritySchema, TicketStatusSchema } from "@tixly/shared";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "./auth.js";
import { toTicketSummary } from "../ai/workflow.js";

const ListQuerySchema = z.object({
  q: z.string().optional(),
  status: TicketStatusSchema.optional(),
  priority: PrioritySchema.optional(),
  assigneeId: z.string().uuid().optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function buildTicketListQuery(raw: unknown) {
  const query = ListQuerySchema.parse(raw);
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;
  if (query.assigneeId) where.assigneeId = query.assigneeId;
  if (query.dueBefore || query.dueAfter) {
    where.dueDate = {
      ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
      ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
    };
  }
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
    ];
  }
  return {
    where,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function registerTicketRoutes(app: FastifyInstance) {
  app.get("/api/tickets", { preHandler: requireAdmin }, async (req) => {
    const list = buildTicketListQuery(req.query);

    const [total, tickets] = await Promise.all([
      prisma.ticket.count({ where: list.where }),
      prisma.ticket.findMany({
        where: list.where,
        include: { assignee: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: list.skip,
        take: list.take,
      }),
    ]);

    return {
      total,
      page: list.page,
      pageSize: list.pageSize,
      tickets: tickets.map((t) => toTicketSummary(t)),
    };
  });

  app.get("/api/tickets/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true, team: true } },
        sourceMessage: true,
      },
    });
    if (!ticket) return reply.status(404).send({ error: "Not found" });
    return {
      ticket: {
        ...toTicketSummary(ticket),
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        originalMessage: ticket.sourceMessage?.content ?? null,
        detectedLanguage: ticket.language,
        creationSource: ticket.creationSource,
      },
    };
  });

  app.patch("/api/tickets/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateTicketBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues[0]?.message || "Invalid body",
      });
    }
    const body = parsed.data;
    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.assigneeId !== undefined
          ? { assigneeId: body.assigneeId }
          : {}),
        ...(body.dueDate !== undefined
          ? {
              dueDate: body.dueDate ? new Date(body.dueDate) : null,
            }
          : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    return { ticket: toTicketSummary(ticket) };
  });

  app.delete("/api/tickets/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = await prisma.ticket.findUnique({ where: { id } });
    if (!existing) return reply.status(404).send({ error: "Not found" });
    await prisma.ticket.delete({ where: { id } });
    return { ok: true };
  });
}
