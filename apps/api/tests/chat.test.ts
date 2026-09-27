import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractionResult } from "@tixly/shared";
import type { ClarificationInput, LLMProvider } from "../src/ai/providers/llm.js";
import { resolveDueDate } from "../src/services/resolveDueDate.js";
import { emptyPendingTicket } from "@tixly/shared";

const PRIYA_ID = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  sessions: new Map<string, { id: string; sessionTokenHash: string; pendingTicket: unknown }>(),
  messages: [] as {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    detectedLanguage: string | null;
    createdAt: Date;
  }[],
  tickets: [] as { id: string; title: string }[],
  clock: 0,
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    chatSession: {
      create: async ({ data }: { data: { sessionTokenHash: string; pendingTicket: unknown } }) => {
        const row = {
          id: crypto.randomUUID(),
          sessionTokenHash: data.sessionTokenHash,
          pendingTicket: data.pendingTicket,
        };
        db.sessions.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.sessions.get(where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const row = db.sessions.get(where.id);
        if (!row) throw new Error("missing session");
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { pendingTicket: unknown };
      }) => {
        const row = db.sessions.get(where.id);
        if (!row) throw new Error("missing session");
        row.pendingTicket = data.pendingTicket;
        return row;
      },
    },
    chatMessage: {
      create: async ({
        data,
      }: {
        data: {
          sessionId: string;
          role: string;
          content: string;
          detectedLanguage?: string | null;
        };
      }) => {
        const row = {
          id: crypto.randomUUID(),
          sessionId: data.sessionId,
          role: data.role,
          content: data.content,
          detectedLanguage: data.detectedLanguage ?? null,
          createdAt: new Date(db.clock++),
        };
        db.messages.push(row);
        return row;
      },
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: { sessionId: string };
        orderBy?: { createdAt: "asc" | "desc" };
        take?: number;
      }) => {
        const dir = orderBy?.createdAt === "desc" ? -1 : 1;
        const rows = db.messages
          .filter((message) => message.sessionId === where.sessionId)
          .sort((a, b) => dir * (a.createdAt.getTime() - b.createdAt.getTime()));
        return take ? rows.slice(0, take) : rows;
      },
      delete: async () => ({ id: "gone" }),
    },
    user: {
      findMany: async () => [
        { id: PRIYA_ID, name: "Priya", team: "Backend" },
        { id: "22222222-2222-4222-8222-222222222222", name: "Amit", team: "Frontend" },
      ],
    },
    ticket: {
      create: async ({
        data,
      }: {
        data: {
          title: string;
          description: string | null;
          assigneeId: string | null;
          dueDate: Date | null;
          priority: string;
          status: string;
          tags: string[];
          language: string | null;
          sourceMessageId: string;
          creationSource: string;
        };
      }) => {
        const row = {
          id: crypto.randomUUID(),
          ...data,
          assignee: data.assigneeId === PRIYA_ID ? { name: "Priya" } : null,
        };
        db.tickets.push(row);
        return row;
      },
      findMany: async () => [],
    },
  },
}));

const { registerChatRoutes } = await import("../src/routes/chat.js");

function extraction(overrides: Partial<ExtractionResult>): ExtractionResult {
  return {
    intent: "ticket",
    language: "en",
    issueSummary: null,
    issueSummaryEn: null,
    description: null,
    assigneeMention: null,
    assigneeMentionLatin: null,
    dueDateMention: null,
    dueDateMentionEn: null,
    priority: null,
    tags: [],
    explicitUnassigned: false,
    explicitNoDeadline: false,
    confirmsProposedDate: null,
    clarifiedMonth: null,
    reply: "fallback",
    ...overrides,
  };
}

function provider(opts: {
  extract: ExtractionResult;
  phrase?: (input: ClarificationInput) => Promise<string>;
}): LLMProvider & { phraseCalls: ClarificationInput[] } {
  const phraseCalls: ClarificationInput[] = [];
  return {
    phraseCalls,
    extractTicket: async () => opts.extract,
    phraseClarification: async (input) => {
      phraseCalls.push(input);
      if (!opts.phrase) throw new Error("wording failed");
      return opts.phrase(input);
    },
  };
}

async function post(llm: LLMProvider, content: string) {
  const app = Fastify();
  await registerChatRoutes(app, llm);
  const res = await app.inject({
    method: "POST",
    url: "/api/chat/message",
    payload: { content, timeZone: "Asia/Kolkata" },
  });
  await app.close();
  return { statusCode: res.statusCode, body: res.json() };
}

beforeEach(() => {
  db.sessions.clear();
  db.messages.length = 0;
  db.tickets.length = 0;
  db.clock = Date.parse("2026-09-19T06:30:00.000Z");
});

describe("POST /api/chat/message", () => {
  it("phrases a clarification in place of the extraction reply", async () => {
    const now = new Date();
    const proposed = resolveDueDate({
      dueDateMentionEn: "by the 4th",
      clarifiedMonth: null,
      confirmsProposedDate: null,
      explicitNoDeadline: false,
      draft: emptyPendingTicket(),
      now,
      timeZone: "Asia/Kolkata",
    }).proposedDueDate;
    const llm = provider({
      extract: extraction({
        language: "hi",
        issueSummaryEn: "Login page crashes on Safari",
        dueDateMentionEn: "by the 4th",
        reply: "Did you mean 4 Oct 2026?",
      }),
      phrase: async () => "किसे असाइन करूँ, और क्या 4 अक्टूबर 2026?",
    });

    const res = await post(llm, "Login page Safari par crash, 4 tarikh tak.");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("needs_clarification");
    expect(res.body.reply).toBe("किसे असाइन करूँ, और क्या 4 अक्टूबर 2026?");
    expect(res.body.reply).not.toMatch(/Did you mean/i);
    expect(llm.phraseCalls[0]?.proposedDueDate).toBe(proposed);
    expect(llm.phraseCalls[0]?.language).toBe("hi");
    expect(db.tickets).toHaveLength(0);
  });

  it("keeps the extraction reply when wording fails, without an English date suffix", async () => {
    const llm = provider({
      extract: extraction({
        language: "hi",
        issueSummaryEn: "Payment page is slow",
        assigneeMentionLatin: "Amit",
        dueDateMentionEn: "by the 4th",
        reply: "Amit assign karun?",
      }),
    });
    const res = await post(llm, "Payment page bahut slow hai, Amit 4 tarikh tak.");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("needs_clarification");
    expect(res.body.reply).toBe("Amit assign karun?");
    expect(res.body.reply).not.toMatch(/Did you mean/i);
    expect(db.tickets).toHaveLength(0);
  });

  it("creates a ticket without asking for wording", async () => {
    const llm = provider({
      extract: extraction({
        issueSummaryEn: "Checkout page throwing 500 errors",
        assigneeMention: "Priya",
        assigneeMentionLatin: "Priya",
        dueDateMentionEn: "tomorrow",
        priority: "HIGH",
        reply: "Ticket created.",
      }),
    });
    const res = await post(llm, "Checkout page is throwing 500 errors. Priya will fix it by tomorrow, high priority.");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.reply).toBe("Ticket created.");
    expect(res.body.ticket.title).toBe("Checkout page throwing 500 errors");
    expect(res.body.ticket.assigneeName).toBe("Priya");
    expect(llm.phraseCalls).toHaveLength(0);
    expect(db.tickets).toHaveLength(1);
  });
});
