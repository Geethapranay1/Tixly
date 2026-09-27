import * as chrono from "chrono-node";
import type { DueDateStatus, PendingTicket } from "@tixly/shared";

export type DueDateResolution = {
  dueDate: string | null;
  proposedDueDate: string | null;
  dueDateStatus: DueDateStatus;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatYmd(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function ymdToParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

const MONTH_NAMES: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

export function parseMonthName(input: string | null | undefined): number | null {
  if (!input) return null;
  const key = input.trim().toLowerCase();
  return MONTH_NAMES[key] ?? null;
}

function isDayOnlyMention(en: string): boolean {
  const s = en.trim().toLowerCase();
  return /^(by\s+)?(the\s+)?\d{1,2}(st|nd|rd|th)?$/.test(s) ||
    /^on\s+the\s+\d{1,2}(st|nd|rd|th)?$/.test(s);
}

function extractDayNumber(en: string): number | null {
  const m = en.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
  if (!m) return null;
  const day = Number(m[1]);
  if (day < 1 || day > 31) return null;
  return day;
}

function nextOccurrenceOfDay(
  day: number,
  now: Date,
  timeZone: string,
): string {
  const todayYmd = formatYmd(now, timeZone);
  const { y, m, d } = ymdToParts(todayYmd);

  let year = y;
  let month = m;
  if (day < d) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCMonth() !== month - 1) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function resolveDueDate(input: {
  dueDateMentionEn: string | null | undefined;
  clarifiedMonth: string | null | undefined;
  confirmsProposedDate: boolean | null | undefined;
  explicitNoDeadline: boolean;
  draft: PendingTicket;
  now: Date;
  timeZone: string;
}): DueDateResolution {
  const {
    dueDateMentionEn,
    clarifiedMonth,
    confirmsProposedDate,
    explicitNoDeadline,
    draft,
    now,
    timeZone,
  } = input;

  if (explicitNoDeadline || draft.dueDateStatus === "explicit_none") {
    return {
      dueDate: null,
      proposedDueDate: null,
      dueDateStatus: "explicit_none",
    };
  }


  if (
    confirmsProposedDate === true &&
    draft.proposedDueDate &&
    (draft.dueDateStatus === "proposed" || draft.dueDateStatus === "ambiguous")
  ) {
    return {
      dueDate: draft.proposedDueDate,
      proposedDueDate: null,
      dueDateStatus: "resolved",
    };
  }

  const monthNum = parseMonthName(clarifiedMonth);
  if (monthNum && draft.proposedDueDate) {
    const day = ymdToParts(draft.proposedDueDate).d;
    const today = ymdToParts(formatYmd(now, timeZone));
    let year = today.y;
    if (
      monthNum < today.m ||
      (monthNum === today.m && day < today.d)
    ) {
      year += 1;
    }
    const ymd = `${year}-${pad(monthNum)}-${pad(day)}`;
    return {
      dueDate: ymd,
      proposedDueDate: null,
      dueDateStatus: "resolved",
    };
  }

  const mention = (dueDateMentionEn || "").trim();
  if (!mention) {
    if (draft.dueDateStatus === "resolved" && draft.dueDate) {
      return {
        dueDate: draft.dueDate,
        proposedDueDate: null,
        dueDateStatus: "resolved",
      };
    }
    if (draft.dueDateStatus === "proposed" && draft.proposedDueDate) {
      return {
        dueDate: null,
        proposedDueDate: draft.proposedDueDate,
        dueDateStatus: "proposed",
      };
    }
    return {
      dueDate: null,
      proposedDueDate: draft.proposedDueDate,
      dueDateStatus: "missing",
    };
  }

 
  if (isDayOnlyMention(mention) && !monthNum) {
    const day = extractDayNumber(mention);
    if (day) {
      const proposed = nextOccurrenceOfDay(day, now, timeZone);
      return {
        dueDate: null,
        proposedDueDate: proposed,
        dueDateStatus: "proposed",
      };
    }
  }

  if (monthNum) {
    const day = extractDayNumber(mention);
    if (day) {
      const today = ymdToParts(formatYmd(now, timeZone));
      let year = today.y;
      if (
        monthNum < today.m ||
        (monthNum === today.m && day < today.d)
      ) {
        year += 1;
      }
      return {
        dueDate: `${year}-${pad(monthNum)}-${pad(day)}`,
        proposedDueDate: null,
        dueDateStatus: "resolved",
      };
    }
  }

  const results = chrono.parse(
    mention,
    { instant: now, timezone: timeZone },
    { forwardDate: true },
  );

  if (!results.length) {
    return {
      dueDate: null,
      proposedDueDate: null,
      dueDateStatus: "ambiguous",
    };
  }

  const best = results[0]!;
  const start = best.start;
  const hasMonth = start.isCertain("month");
  const hasDay = start.isCertain("day");
  const date = start.date();

  if (hasDay && !hasMonth) {
    const day = start.get("day")!;
    const proposed = nextOccurrenceOfDay(day, now, timeZone);
    return {
      dueDate: null,
      proposedDueDate: proposed,
      dueDateStatus: "proposed",
    };
  }

  if (!hasDay && !start.isCertain("weekday") && !mention.match(/tomorrow|today|tonight|weekend|week/i)) {
    return {
      dueDate: null,
      proposedDueDate: null,
      dueDateStatus: "ambiguous",
    };
  }

  const ymd = formatYmd(date, timeZone);
  return {
    dueDate: ymd,
    proposedDueDate: null,
    dueDateStatus: "resolved",
  };
}

export function formatHumanDate(ymd: string, timeZone: string): string {
  const { y, m, d } = ymdToParts(ymd);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
