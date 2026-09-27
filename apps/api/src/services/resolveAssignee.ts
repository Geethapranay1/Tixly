import type { AssigneeStatus } from "@tixly/shared";

export type AssignableUser = {
  id: string;
  name: string;
  team: string | null;
};

export type AssigneeResolution = {
  assigneeId: string | null;
  assigneeStatus: AssigneeStatus;
  assigneeCandidates: AssignableUser[];
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstName(name: string): string {
  return normalize(name).split(" ")[0] ?? "";
}

export function resolveAssignee(
  mention: string | null | undefined,
  mentionLatin: string | null | undefined,
  users: AssignableUser[],
  opts?: { alreadyExplicitNone?: boolean },
): AssigneeResolution {
  if (opts?.alreadyExplicitNone) {
    return {
      assigneeId: null,
      assigneeStatus: "explicit_none",
      assigneeCandidates: [],
    };
  }

  const needle = normalize(mentionLatin || mention || "");
  if (!needle) {
    return {
      assigneeId: null,
      assigneeStatus: "missing",
      assigneeCandidates: [],
    };
  }

  const exact = users.filter((u) => normalize(u.name) === needle);
  if (exact.length === 1) {
    return {
      assigneeId: exact[0]!.id,
      assigneeStatus: "resolved",
      assigneeCandidates: [],
    };
  }
  if (exact.length > 1) {
    return {
      assigneeId: null,
      assigneeStatus: "ambiguous",
      assigneeCandidates: exact,
    };
  }

  const byFirst = users.filter((u) => firstName(u.name) === needle);
  if (byFirst.length === 1) {
    return {
      assigneeId: byFirst[0]!.id,
      assigneeStatus: "resolved",
      assigneeCandidates: [],
    };
  }
  if (byFirst.length > 1) {
    return {
      assigneeId: null,
      assigneeStatus: "ambiguous",
      assigneeCandidates: byFirst,
    };
  }

  const partial = users.filter((u) => {
    const n = normalize(u.name);
    return n.includes(needle) || needle.includes(n);
  });
  if (partial.length === 1) {
    return {
      assigneeId: partial[0]!.id,
      assigneeStatus: "resolved",
      assigneeCandidates: [],
    };
  }
  if (partial.length > 1) {
    return {
      assigneeId: null,
      assigneeStatus: "ambiguous",
      assigneeCandidates: partial,
    };
  }

  return {
    assigneeId: null,
    assigneeStatus: "missing",
    assigneeCandidates: users.slice(0, 8),
  };
}
