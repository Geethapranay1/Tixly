import type { FastifyInstance } from "fastify";
import {
  ChatMessageBodySchema,
  emptyPendingTicket,
  type PendingTicket,
} from "@tixly/shared";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import {
  generateSessionToken,
  hashSessionToken,
  verifySessionToken,
} from "../lib/sessionToken.js";
import { invokeTicketGraph } from "../ai/graph.js";
import { OpenAIProvider } from "../ai/providers/openai.js";
import { toTicketSummary } from "../ai/workflow.js";
import type { LLMProvider } from "../ai/providers/llm.js";
import { resolveTimeZone } from "../lib/timezone.js";

let llmSingleton: LLMProvider | null = null;

function getLlm(): LLMProvider {
  if (!llmSingleton) {
    llmSingleton = new OpenAIProvider();
  }
  return llmSingleton;
}

function getSessionToken(req: {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}): string | undefined {
  const header = req.headers["x-session-token"];
  if (typeof header === "string" && header) return header;
  if (Array.isArray(header) && header[0]) return header[0];
  const body = req.body as { sessionToken?: string } | undefined;
  return body?.sessionToken;
}

function isAbort(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || /aborted/i.test(err.message);
}

export async function registerChatRoutes(
  app: FastifyInstance,
  llm?: LLMProvider,
) {
  const resolveLlm = () => llm ?? getLlm();
  app.post("/api/chat/message", async (req, reply) => {
    const body = ChatMessageBodySchema.parse(req.body);
    const timeZone = resolveTimeZone(body.timeZone);
    const providedToken = getSessionToken(req);

    let sessionId = body.sessionId;
    let sessionToken: string | undefined;
    let isNewSession = false;

    if (sessionId) {
      if (!providedToken) {
        return reply.status(404).send({ error: "Not found" });
      }
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (!session || !verifySessionToken(providedToken, session.sessionTokenHash)) {
        return reply.status(404).send({ error: "Not found" });
      }
    } else {
      sessionToken = generateSessionToken();
      const created = await prisma.chatSession.create({
        data: {
          sessionTokenHash: hashSessionToken(sessionToken),
          pendingTicket: emptyPendingTicket(),
        },
      });
      sessionId = created.id;
      isNewSession = true;
    }

    const session = await prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const pending =
      (session.pendingTicket as PendingTicket | null) ?? emptyPendingTicket();

    const userMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        role: "USER",
        content: body.content,
      },
    });

    const history = (
      await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    ).reverse();

    const members = await prisma.user.findMany({
      where: { role: "MEMBER" },
      select: { id: true, name: true, team: true },
    });

    const abort = new AbortController();
    let settled = false;
    const onClientGone = () => {
      if (!settled) abort.abort();
    };
    req.raw.on("aborted", onClientGone);
    reply.raw.on("close", onClientGone);

    let result: Awaited<ReturnType<typeof invokeTicketGraph>>;
    try {
      result = await invokeTicketGraph(resolveLlm(), {
        userMessage: body.content,
        pendingTicket: pending,
        recentMessages: history.map((m) => ({
          role: m.role === "USER" ? "user" : "assistant",
          content: m.content,
        })),
        users: members,
        timeZone,
        signal: abort.signal,
      });
      if (result.status === "needs_clarification" && !abort.signal.aborted) {
        try {
          const phrased = await resolveLlm().phraseClarification({
            language: result.language,
            userMessage: body.content,
            missingFields: result.missingFields,
            proposedDueDate: result.draft?.proposedDueDate ?? null,
            assigneeCandidates: result.draft?.assigneeCandidates ?? [],
            signal: abort.signal,
          });
          if (phrased.trim()) result = { ...result, reply: phrased.trim() };
        } catch (phraseErr) {
          if (isAbort(phraseErr, abort.signal)) throw phraseErr;
          console.warn(
            "Clarification wording failed, using extraction reply:",
            phraseErr,
          );
        }
      }
    } catch (err) {
      if (isAbort(err, abort.signal)) {
        await prisma.chatMessage
          .delete({ where: { id: userMsg.id } })
          .catch(() => {});
        return reply.status(499).send({ error: "Aborted" });
      }
      console.error("Chat workflow failed:", err);
      result = {
        status: "non_ticket" as const,
        missingFields: [] as string[],
        reply:
          "Sorry — I had trouble reaching the AI service. Please try again shortly.",
        draft: pending,
        shouldCreate: false,
        language: null as string | null,
      };
    } finally {
      settled = true;
      req.raw.off("aborted", onClientGone);
      reply.raw.off("close", onClientGone);
    }

    if (abort.signal.aborted) {
      await prisma.chatMessage
        .delete({ where: { id: userMsg.id } })
        .catch(() => {});
      return reply.status(499).send({ error: "Aborted" });
    }

    let ticketSummary = undefined;
    let assistantContent = result.reply;

    if (result.shouldCreate && result.draft?.issueSummaryEn) {
      const due =
        result.draft.dueDateStatus === "resolved" && result.draft.dueDate
          ? new Date(result.draft.dueDate)
          : null;

      const ticket = await prisma.ticket.create({
        data: {
          title: result.draft.issueSummaryEn,
          description: result.draft.description,
          assigneeId:
            result.draft.assigneeStatus === "resolved"
              ? result.draft.assigneeId
              : null,
          dueDate: due,
          priority: result.draft.priority,
          status: "OPEN",
          tags: result.draft.tags,
          language: result.language ?? result.draft.language,
          sourceMessageId: userMsg.id,
          creationSource: "CHAT",
        },
        include: { assignee: { select: { id: true, name: true } } },
      });
      ticketSummary = toTicketSummary(ticket);
      assistantContent = result.reply || "Ticket created.";
    }

    await prisma.chatMessage.create({
      data: {
        sessionId,
        role: "ASSISTANT",
        content: assistantContent,
        detectedLanguage: result.language,
      },
    });

    const nextPending =
      result.status === "complete" || result.status === "cancelled"
        ? null
        : result.draft;

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        pendingTicket:
          nextPending === null ? Prisma.JsonNull : nextPending,
      },
    });

    return {
      status: result.status,
      missingFields: result.missingFields,
      reply: assistantContent,
      ticket: ticketSummary,
      sessionId,
      ...(isNewSession && sessionToken ? { sessionToken } : {}),
    };
  });

  app.get("/api/chat/sessions/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const token = getSessionToken(req);
    if (!token) return reply.status(404).send({ error: "Not found" });

    const session = await prisma.chatSession.findUnique({ where: { id } });
    if (!session || !verifySessionToken(token, session.sessionTokenHash)) {
      return reply.status(404).send({ error: "Not found" });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "asc" },
    });

    const tickets = await prisma.ticket.findMany({
      where: {
        sourceMessageId: { in: messages.map((m) => m.id) },
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    const ticketBySourceId = new Map(
      tickets
        .filter((t) => t.sourceMessageId)
        .map((t) => [t.sourceMessageId!, toTicketSummary(t)]),
    );

    return {
      sessionId: id,
      pendingTicket: session.pendingTicket,
      messages: messages.map((m, index) => {
        const role = m.role === "USER" ? ("user" as const) : ("assistant" as const);
        let ticket = undefined;
        // Card sits on the assistant reply that followed the creating user message
        if (
          role === "assistant" &&
          index > 0 &&
          messages[index - 1]?.role === "USER"
        ) {
          ticket = ticketBySourceId.get(messages[index - 1]!.id);
        }
        return {
          id: m.id,
          role,
          content: m.content,
          detectedLanguage: m.detectedLanguage,
          createdAt: m.createdAt.toISOString(),
          ...(ticket ? { ticket } : {}),
        };
      }),
    };
  });
}
