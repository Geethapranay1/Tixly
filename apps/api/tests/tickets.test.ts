import { describe, expect, it } from "vitest";
import { buildTicketListQuery } from "../src/routes/tickets.js";

const assigneeId = "11111111-1111-4111-8111-111111111111";

describe("buildTicketListQuery", () => {
  it("applies status, assignee, priority, due date, and search", () => {
    const list = buildTicketListQuery({
      q: "login",
      status: "OPEN",
      priority: "HIGH",
      assigneeId,
      dueBefore: "2026-10-04",
    });
    expect(list.where).toMatchObject({
      status: "OPEN",
      priority: "HIGH",
      assigneeId,
    });
    expect(list.where.OR).toEqual([
      { title: { contains: "login", mode: "insensitive" } },
      { description: { contains: "login", mode: "insensitive" } },
    ]);
    const due = list.where.dueDate as { lte: Date };
    expect(due.lte.toISOString().slice(0, 10)).toBe("2026-10-04");
    expect(list.skip).toBe(0);
    expect(list.take).toBe(20);
  });

  it("skips the first page on page 2", () => {
    const list = buildTicketListQuery({ page: "2", pageSize: "20" });
    expect(list.page).toBe(2);
    expect(list.skip).toBe(20);
    expect(list.take).toBe(20);
    expect(list.where).toEqual({});
  });
});
