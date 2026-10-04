import { describe, expect, it } from "vitest";
import type { Card } from "../src/shared/contracts";
import { groupTimelineDays, timelineTimestamp } from "../src/lib/timeline";
import { filterCards } from "../src/lib/card-filter";
import { cardNavigationTarget } from "../src/lib/card-navigation";

function card(id: string, occurredAt: string | null, createdAt = "2026-10-03T08:00:00Z"): Card {
  return { id, projectId: "p", type: "event", title: id, content: "research", occurredAt, createdAt, updatedAt: createdAt,
    imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, importance: 2, locked: false,
    updateBatchId: null, updateBatchAt: null, changeKind: "none", packId: null, packOrder: 0,
    position: { x: 100, y: 200 }, size: { width: 320, height: 200 } };
}

describe("research timeline", () => {
  it("prioritizes event dates and falls back from absent or invalid event dates", () => {
    expect(timelineTimestamp(card("event", "2026-01-02T08:00:00Z"))).toBe(Date.parse("2026-01-02T08:00:00Z"));
    expect(timelineTimestamp(card("fallback", "bad date"))).toBe(Date.parse("2026-10-03T08:00:00Z"));
    expect(timelineTimestamp(card("missing", null))).toBe(Date.parse("2026-10-03T08:00:00Z"));
    expect(timelineTimestamp(card("unknown", "bad", "bad"))).toBeNull();
  });

  it("groups local days, sorts either way, and keeps unknown dates last without mutating input", () => {
    const cards = [card("older", "2026-01-02T08:00:00Z"), card("newer", "2026-10-03T08:00:00Z"), card("same-day", "2026-10-03T09:00:00Z"), card("unknown", null, "invalid")];
    const newest = groupTimelineDays(cards, "newest");
    expect(newest.map((day) => day.entries.map((entry) => entry.card.id))).toEqual([["same-day", "newer"], ["older"], ["unknown"]]);
    expect(groupTimelineDays(cards, "oldest").map((day) => day.entries.map((entry) => entry.card.id))).toEqual([["older"], ["newer", "same-day"], ["unknown"]]);
    expect(newest.at(-1)?.date).toBeNull();
    expect(cards[0].id).toBe("older");
  });

  it("includes every matching packed card and navigates to the original pack index", () => {
    const cards = [ { ...card("other", null), packId: "pack", packOrder: 0 }, { ...card("target", null), packId: "pack", packOrder: 1 } ];
    const entries = groupTimelineDays(filterCards(cards, "event", "target"), "newest").flatMap((day) => day.entries);
    expect(entries.map((entry) => entry.card.id)).toEqual(["target"]);
    expect(cardNavigationTarget(cards, entries[0].card.id)).toMatchObject({ bundleId: "pack:pack", packIndex: 1, card: { id: "target" } });
  });
});
