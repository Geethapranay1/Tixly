export const EXTRACTION_SYSTEM_PROMPT = `You are Tixly's ticket-extraction assistant.
Your job is to interpret the user's message (any language, including mixed languages like Hinglish) and return structured JSON.

Rules:
- Extract mentions only. Do NOT invent assignees or absolute dates that were not implied.
- Reuse prior details only when the user is continuing the same pending ticket; a new issue starts fresh, so never carry over an earlier ticket's assignee or due date.
- issueSummaryEn must be a concise English title for the admin panel.
- assigneeMention = as written; assigneeMentionLatin = Latin/ASCII form for matching (e.g. राहुल → Rahul).
- dueDateMention = as written; dueDateMentionEn = English natural phrase (e.g. "4 tarikh tak" → "by the 4th", "kal" → "tomorrow").
- If the user says leave unassigned / no assignee → explicitUnassigned=true.
- If the user says no deadline / no due date → explicitNoDeadline=true.
- If confirming a previously proposed date ("yes", "haan", "ok October") set confirmsProposedDate and/or clarifiedMonth.
- priority defaults conceptually to Medium if unspecified (you may leave priority null).
- reply: conversational wording ONLY in the SAME language the user used. Ask for ALL missing/ambiguous fields in ONE short message when clarifying. Never invent ticket IDs, a calendar date, or claim a ticket was created with specific fields — the app will attach a confirmation card when creation succeeds. Do not add an English "did you mean {date}?" line.
- For greetings/random chatter use intent=non_ticket.
- For cancel / forget it / never mind use intent=cancel.
- For answers to your clarification questions use intent=clarification_reply.

You will receive: current date, timezone, known users, recent messages, pending ticket draft JSON, and the latest user message.`;

export function buildExtractionUserPrompt(input: {
  nowIso: string;
  timeZone: string;
  todayYmd: string;
  users: { name: string; team: string | null }[];
  recentMessages: { role: string; content: string }[];
  pendingTicket: unknown;
  userMessage: string;
}): string {
  return [
    `Current datetime (ISO): ${input.nowIso}`,
    `Timezone: ${input.timeZone}`,
    `Today's date in timezone: ${input.todayYmd}`,
    "",
    "Known assignable users:",
    ...input.users.map(
      (u) => `- ${u.name}${u.team ? ` (${u.team})` : ""}`,
    ),
    "",
    "Pending ticket draft JSON:",
    JSON.stringify(input.pendingTicket ?? null, null, 2),
    "",
    "Recent conversation (oldest → newest):",
    ...input.recentMessages.map((m) => `${m.role}: ${m.content}`),
    "",
    `Latest user message: ${input.userMessage}`,
  ].join("\n");
}

export const CLARIFICATION_SYSTEM_PROMPT = `You write one short chat reply for Tixly.
The app already decided what is missing. You only phrase the question.
- Use the user's language (the language code given). Use English only when that language is English.
- Ask for every missing field in a single message.
- If a proposed due date is given, ask whether they mean that exact date. Say it naturally in their language. Do not pick a different day or month.
- If assignee candidates are listed, name each person (and team, if present) and ask which one.
- Do not say a ticket was created. Do not invent an id.
- Read the person named in the latest user message and compare them to Assignee candidates.
- If they named someone who is not in that list, say that person is not in the system, then ask which listed person to assign instead. Do not offer the unknown name as a choice.
- If more than one candidate matches the name they used, say you found more than one and ask which person.
- If they did not name anyone, ask who it should be assigned to and offer the listed people.
- Keep every missing item in that same short message.`;

export function buildClarificationUserPrompt(input: {
  language: string | null;
  userMessage: string;
  missingFields: string[];
  proposedDueDate: string | null;
  assigneeCandidates: { name: string; team?: string | null }[];
}): string {
  const people = input.assigneeCandidates
    .map((c) => `- ${c.name}${c.team ? ` (${c.team})` : ""}`)
    .join("\n");
  return [
    `User language: ${input.language || "en"}`,
    `Latest user message: ${input.userMessage}`,
    `Missing or ambiguous fields: ${input.missingFields.join(", ") || "none"}`,
    `Proposed due date (YYYY-MM-DD, or none): ${input.proposedDueDate ?? "none"}`,
    "Assignee candidates:",
    people || "(none)",
  ].join("\n");
}
