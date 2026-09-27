import { describe, expect, it } from "vitest";
import { emptyPendingTicket, type ExtractionResult } from "@tixly/shared";
import { mergeDraft } from "../src/services/mergeDraft.js";
import { resolveAssignee } from "../src/services/resolveAssignee.js";
import {
  formatYmd,
  resolveDueDate,
} from "../src/services/resolveDueDate.js";
import { validateDraft } from "../src/services/validateDraft.js";

const users = [
  { id: "1", name: "Priya", team: "Backend" },
  { id: "2", name: "Amit", team: "Frontend" },
  { id: "3", name: "Rahul Sharma", team: "Backend" },
  { id: "4", name: "Rahul Verma", team: "Frontend" },
];

function extraction(
  overrides: Partial<ExtractionResult>,
): ExtractionResult {
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
    reply: "ok",
    ...overrides,
  };
}

describe("resolveAssignee", () => {
  it("resolves unique first name", () => {
    const r = resolveAssignee("Priya", "Priya", users);
    expect(r.assigneeStatus).toBe("resolved");
    expect(r.assigneeId).toBe("1");
  });

  it("flags ambiguous Rahul", () => {
    const r = resolveAssignee("Rahul", "Rahul", users);
    expect(r.assigneeStatus).toBe("ambiguous");
    expect(r.assigneeCandidates).toHaveLength(2);
  });

  it("lists users when unknown", () => {
    const r = resolveAssignee("Nobody", "Nobody", users);
    expect(r.assigneeStatus).toBe("missing");
    expect(r.assigneeCandidates.length).toBeGreaterThan(0);
  });

  it("matches Latin form", () => {
    const r = resolveAssignee("राहुल", "Rahul Sharma", users);
    expect(r.assigneeStatus).toBe("resolved");
    expect(r.assigneeId).toBe("3");
  });
});

describe("resolveDueDate", () => {
  const now = new Date("2026-09-19T12:00:00+05:30");
  const tz = "Asia/Kolkata";

  it("resolves tomorrow", () => {
    const r = resolveDueDate({
      dueDateMentionEn: "tomorrow",
      clarifiedMonth: null,
      confirmsProposedDate: null,
      explicitNoDeadline: false,
      draft: emptyPendingTicket(),
      now,
      timeZone: tz,
    });
    expect(r.dueDateStatus).toBe("resolved");
    expect(r.dueDate).toBe("2026-09-20");
  });

  it("proposes day without month for Example B and Example C (4 tarikh → by the 4th)", () => {
    const r = resolveDueDate({
      dueDateMentionEn: "by the 4th",
      clarifiedMonth: null,
      confirmsProposedDate: null,
      explicitNoDeadline: false,
      draft: emptyPendingTicket(),
      now,
      timeZone: tz,
    });
    expect(r.dueDateStatus).toBe("proposed");
    expect(r.proposedDueDate).toBe("2026-10-04");
  });

  it("accepts confirmation of proposed date", () => {
    const draft = emptyPendingTicket();
    draft.proposedDueDate = "2026-10-04";
    draft.dueDateStatus = "proposed";
    const r = resolveDueDate({
      dueDateMentionEn: null,
      clarifiedMonth: null,
      confirmsProposedDate: true,
      explicitNoDeadline: false,
      draft,
      now,
      timeZone: tz,
    });
    expect(r.dueDateStatus).toBe("resolved");
    expect(r.dueDate).toBe("2026-10-04");
  });

  it("binds clarified month", () => {
    const draft = emptyPendingTicket();
    draft.proposedDueDate = "2026-10-04";
    draft.dueDateStatus = "proposed";
    const r = resolveDueDate({
      dueDateMentionEn: null,
      clarifiedMonth: "October",
      confirmsProposedDate: null,
      explicitNoDeadline: false,
      draft,
      now,
      timeZone: tz,
    });
    expect(r.dueDateStatus).toBe("resolved");
    expect(r.dueDate).toBe("2026-10-04");
  });
});

describe("merge + validate", () => {
  it("asks for both assignee and date", () => {
    const draft = mergeDraft(
      null,
      extraction({
        issueSummaryEn: "Login crashes on Safari",
        issueSummary: "Login crashes on Safari",
      }),
    );
    const v = validateDraft(draft, "ticket");
    expect(v.status).toBe("needs_clarification");
    expect(v.missingFields).toEqual(
      expect.arrayContaining(["assignee", "dueDate"]),
    );
  });

  it("completes when all resolved", () => {
    let draft = mergeDraft(
      null,
      extraction({
        issueSummaryEn: "Checkout 500s",
        assigneeMentionLatin: "Priya",
        dueDateMentionEn: "tomorrow",
        priority: "HIGH",
      }),
    );
    const a = resolveAssignee("Priya", "Priya", users);
    draft = {
      ...draft,
      assigneeId: a.assigneeId,
      assigneeStatus: a.assigneeStatus,
    };
    const d = resolveDueDate({
      dueDateMentionEn: "tomorrow",
      clarifiedMonth: null,
      confirmsProposedDate: null,
      explicitNoDeadline: false,
      draft,
      now: new Date("2026-09-19T12:00:00+05:30"),
      timeZone: "Asia/Kolkata",
    });
    draft = { ...draft, ...d };
    const v = validateDraft(draft, "ticket");
    expect(v.status).toBe("complete");
  });

  it("cancel clears draft via merge", () => {
    const prev = emptyPendingTicket();
    prev.issueSummaryEn = "Something";
    const draft = mergeDraft(
      prev,
      extraction({ intent: "cancel", reply: "ok" }),
    );
    expect(draft.issueSummaryEn).toBeNull();
  });
});

describe("formatYmd", () => {
  it("formats in timezone", () => {
    expect(formatYmd(new Date("2026-09-19T12:00:00+05:30"), "Asia/Kolkata")).toBe(
      "2026-09-19",
    );
  });
});
