import type { PendingTicket, WorkflowStatus } from "@tixly/shared";

export type ValidationResult = {
  status: WorkflowStatus;
  missingFields: string[];
  ambiguities: string[];
};

export function validateDraft(
  draft: PendingTicket,
  intent: string,
): ValidationResult {
  if (intent === "cancel") {
    return { status: "cancelled", missingFields: [], ambiguities: [] };
  }
  if (intent === "non_ticket" && !draft.issueSummaryEn && draft.assigneeStatus === "missing" && draft.dueDateStatus === "missing") {
    return { status: "non_ticket", missingFields: [], ambiguities: [] };
  }

  const missingFields: string[] = [];
  const ambiguities: string[] = [];

  if (!draft.issueSummaryEn?.trim()) {
    missingFields.push("summary");
  }

  if (draft.assigneeStatus === "missing") {
    missingFields.push("assignee");
  } else if (draft.assigneeStatus === "ambiguous") {
    ambiguities.push("assignee");
  }

  if (draft.dueDateStatus === "missing") {
    missingFields.push("dueDate");
  } else if (
    draft.dueDateStatus === "proposed" ||
    draft.dueDateStatus === "ambiguous"
  ) {
    ambiguities.push("dueDate");
  }

  if (missingFields.length || ambiguities.length) {
    if (
      intent === "non_ticket" ||
      (!draft.issueSummaryEn &&
        draft.assigneeStatus === "missing" &&
        draft.dueDateStatus === "missing" &&
        intent !== "ticket" &&
        intent !== "clarification_reply")
    ) {
      if (intent === "non_ticket") {
        return { status: "non_ticket", missingFields: [], ambiguities: [] };
      }
    }
    return {
      status: "needs_clarification",
      missingFields,
      ambiguities,
    };
  }


  if (!draft.issueSummaryEn?.trim()) {
    return {
      status: "needs_clarification",
      missingFields: ["summary"],
      ambiguities: [],
    };
  }

  const canCreate =
    (draft.assigneeStatus === "resolved" ||
      draft.assigneeStatus === "explicit_none") &&
    (draft.dueDateStatus === "resolved" ||
      draft.dueDateStatus === "explicit_none");

  if (canCreate && draft.issueSummaryEn) {
    return { status: "complete", missingFields: [], ambiguities: [] };
  }

  return {
    status: "needs_clarification",
    missingFields,
    ambiguities,
  };
}
