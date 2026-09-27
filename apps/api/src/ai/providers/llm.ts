import type { ExtractionResult } from "@tixly/shared";

export type ExtractionInput = {
  nowIso: string;
  timeZone: string;
  todayYmd: string;
  users: { name: string; team: string | null }[];
  recentMessages: { role: string; content: string }[];
  pendingTicket: unknown;
  userMessage: string;
  signal?: AbortSignal;
};

export type ClarificationInput = {
  language: string | null;
  userMessage: string;
  missingFields: string[];
  proposedDueDate: string | null;
  assigneeCandidates: { name: string; team?: string | null }[];
  signal?: AbortSignal;
};

export interface LLMProvider {
  extractTicket(input: ExtractionInput): Promise<ExtractionResult>;
  phraseClarification(input: ClarificationInput): Promise<string>;
}
