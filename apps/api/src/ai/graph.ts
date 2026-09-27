import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ExtractionResult, PendingTicket } from "@tixly/shared";
import { mergeDraft } from "../services/mergeDraft.js";
import {
  resolveAssignee,
  type AssignableUser,
} from "../services/resolveAssignee.js";
import { resolveDueDate } from "../services/resolveDueDate.js";
import { validateDraft } from "../services/validateDraft.js";
import type { LLMProvider } from "./providers/llm.js";
import { formatYmd } from "../services/resolveDueDate.js";
import type { ChatWorkflowResult } from "./workflow.js";

const GraphState = Annotation.Root({
  userMessage: Annotation<string>,
  pendingTicket: Annotation<PendingTicket | null>,
  recentMessages: Annotation<{ role: string; content: string }[]>,
  users: Annotation<AssignableUser[]>,
  now: Annotation<Date>,
  timeZone: Annotation<string>,
  signal: Annotation<AbortSignal | undefined>,
  extraction: Annotation<ExtractionResult | null>,
  draft: Annotation<PendingTicket | null>,
  result: Annotation<ChatWorkflowResult | null>,
  llmError: Annotation<string | null>,
});

export function buildTicketGraph(llm: LLMProvider) {
  const extract = async (state: typeof GraphState.State) => {
    try {
      if (state.signal?.aborted) {
        const err = new Error("Aborted");
        err.name = "AbortError";
        throw err;
      }
      const timeZone = state.timeZone;
      const extraction = await llm.extractTicket({
        nowIso: state.now.toISOString(),
        timeZone,
        todayYmd: formatYmd(state.now, timeZone),
        users: state.users.map((u) => ({ name: u.name, team: u.team })),
        recentMessages: state.recentMessages.slice(-10),
        pendingTicket: state.pendingTicket,
        userMessage: state.userMessage,
        signal: state.signal,
      });
      return { extraction, llmError: null };
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === "AbortError" || /aborted/i.test(e.message))
      ) {
        throw e;
      }
      return {
        extraction: null,
        llmError: e instanceof Error ? e.message : "LLM error",
      };
    }
  };

  const mergeAndResolve = async (state: typeof GraphState.State) => {
    if (state.llmError || !state.extraction) {
      return {
        result: {
          status: "non_ticket" as const,
          missingFields: [],
          reply:
            "Sorry — I had trouble understanding that just now. Please try again in a moment.",
          draft: state.pendingTicket,
          shouldCreate: false,
          language: null,
        },
      };
    }

    const extraction = state.extraction;
    if (extraction.intent === "cancel") {
      return {
        draft: null,
        result: {
          status: "cancelled" as const,
          missingFields: [],
          reply:
            extraction.reply || "Okay, forgotten. No ticket was created.",
          draft: null,
          shouldCreate: false,
          language: extraction.language,
        },
      };
    }

    let draft = mergeDraft(state.pendingTicket, extraction);

    if (
      extraction.explicitUnassigned ||
      extraction.assigneeMention ||
      extraction.assigneeMentionLatin
    ) {
      const resolved = resolveAssignee(
        extraction.assigneeMention,
        extraction.assigneeMentionLatin,
        state.users,
        { alreadyExplicitNone: extraction.explicitUnassigned },
      );
      draft = {
        ...draft,
        assigneeId: resolved.assigneeId,
        assigneeStatus: resolved.assigneeStatus,
        assigneeCandidates: resolved.assigneeCandidates,
      };
    }

    const due = resolveDueDate({
      dueDateMentionEn: extraction.dueDateMentionEn,
      clarifiedMonth: extraction.clarifiedMonth,
      confirmsProposedDate: extraction.confirmsProposedDate,
      explicitNoDeadline: extraction.explicitNoDeadline,
      draft,
      now: state.now,
      timeZone: state.timeZone,
    });
    draft = {
      ...draft,
      dueDate: due.dueDate,
      proposedDueDate: due.proposedDueDate,
      dueDateStatus: due.dueDateStatus,
    };

    return { draft, extraction };
  };

  const validate = async (state: typeof GraphState.State) => {
    if (state.result) return {};
    if (!state.extraction) return {};

    const extraction = state.extraction;
    const draft = state.draft;

    if (
      extraction.intent === "non_ticket" &&
      (!draft ||
        (!draft.issueSummaryEn &&
          draft.assigneeStatus === "missing" &&
          draft.dueDateStatus === "missing"))
    ) {
      return {
        result: {
          status: "non_ticket" as const,
          missingFields: [],
          reply:
            extraction.reply ||
            "Hi! Tell me about an issue and I'll turn it into a ticket.",
          draft: state.pendingTicket,
          shouldCreate: false,
          language: extraction.language,
        },
      };
    }

    const validation = validateDraft(
      draft ?? state.pendingTicket ?? mergeDraft(null, extraction),
      extraction.intent,
    );

    const finalDraft = draft;

    if (validation.status === "complete" && finalDraft) {
      return {
        result: {
          status: "complete" as const,
          missingFields: [],
          reply: extraction.reply || "Ticket created.",
          draft: finalDraft,
          shouldCreate: true,
          language: extraction.language || finalDraft.language,
        },
      };
    }

    return {
      result: {
        status: validation.status,
        missingFields: [
          ...validation.missingFields,
          ...validation.ambiguities,
        ],
        reply: extraction.reply || "Could you clarify a few details?",
        draft: validation.status === "cancelled" ? null : finalDraft,
        shouldCreate: false,
        language: extraction.language,
      },
    };
  };

  return new StateGraph(GraphState)
    .addNode("extract_intent", extract)
    .addNode("merge_resolve", mergeAndResolve)
    .addNode("validate", validate)
    .addEdge(START, "extract_intent")
    .addEdge("extract_intent", "merge_resolve")
    .addEdge("merge_resolve", "validate")
    .addEdge("validate", END)
    .compile();
}

export async function invokeTicketGraph(
  llm: LLMProvider,
  input: {
    userMessage: string;
    pendingTicket: PendingTicket | null;
    recentMessages: { role: string; content: string }[];
    users: AssignableUser[];
    timeZone: string;
    now?: Date;
    signal?: AbortSignal;
  },
): Promise<ChatWorkflowResult> {
  const app = buildTicketGraph(llm);
  const out = await app.invoke({
    userMessage: input.userMessage,
    pendingTicket: input.pendingTicket,
    recentMessages: input.recentMessages,
    users: input.users,
    now: input.now ?? new Date(),
    timeZone: input.timeZone,
    signal: input.signal,
    extraction: null,
    draft: null,
    result: null,
    llmError: null,
  });
  if (!out.result) {
    return {
      status: "non_ticket",
      missingFields: [],
      reply: "Something went wrong. Please try again.",
      draft: input.pendingTicket,
      shouldCreate: false,
      language: null,
    };
  }
  return out.result;
}
