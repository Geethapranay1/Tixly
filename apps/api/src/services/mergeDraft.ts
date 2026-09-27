import type {
  ExtractionResult,
  PendingTicket,
} from "@tixly/shared";
import { emptyPendingTicket } from "@tixly/shared";

function coalesce<T>(next: T | null | undefined, prev: T): T {
  if (next === null || next === undefined) return prev;
  if (typeof next === "string" && next.trim() === "") return prev;
  return next;
}

export function mergeDraft(
  previous: PendingTicket | null | undefined,
  extraction: ExtractionResult,
): PendingTicket {
  if (extraction.intent === "cancel") {
    return emptyPendingTicket();
  }

  const base = previous ?? emptyPendingTicket();

  const next: PendingTicket = {
    ...base,
    issueSummaryEn: coalesce(extraction.issueSummaryEn, base.issueSummaryEn),
    description: coalesce(
      extraction.description ?? extraction.issueSummary,
      base.description,
    ),
    language: coalesce(extraction.language, base.language),
    priority: extraction.priority ?? base.priority ?? "MEDIUM",
    tags:
      extraction.tags.length > 0
        ? Array.from(new Set([...base.tags, ...extraction.tags]))
        : base.tags,
  };

  if (extraction.explicitUnassigned) {
    next.assigneeId = null;
    next.assigneeStatus = "explicit_none";
    next.assigneeCandidates = [];
  }

  if (extraction.explicitNoDeadline) {
    next.dueDate = null;
    next.proposedDueDate = null;
    next.dueDateStatus = "explicit_none";
  }

  if (
    extraction.confirmsProposedDate === true &&
    base.proposedDueDate &&
    (base.dueDateStatus === "proposed" || base.dueDateStatus === "ambiguous")
  ) {
    next.dueDate = base.proposedDueDate;
    next.proposedDueDate = null;
    next.dueDateStatus = "resolved";
  }

  return next;
}
