import { describe, expect, it } from "vitest";
import { cardNavigationTarget } from "../src/lib/card-navigation";
import type { Card } from "../src/shared/contracts";

function card(id: string, input: Partial<Card> = {}): Card {
  return {
    id,
    projectId: "project",
    type: "news",
    title: id,
    content: id,
    imageUrl: null,
    sourceUrl: null,
    sourceName: null,
    sourceLinks: [],
    focusCategory: null,
    occurredAt: null,
    importance: 2,
    locked: false,
    updateBatchId: "batch",
    updateBatchAt: "2026-08-30T00:00:00.000Z",
    changeKind: "none",
    packId: null,
    packOrder: 0,
    position: { x: 100, y: 200 },
    size: { width: 320, height: 220 },
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    ...input,
  };
}

describe("card conflict navigation", () => {
  it("returns the exact page index for a card inside a pack", () => {
    const cards = [
      card("first", { packId: "pack", packOrder: 0 }),
      card("conflict", { packId: "pack", packOrder: 2, changeKind: "conflict" }),
      card("middle", { packId: "pack", packOrder: 1 }),
    ];
    expect(cardNavigationTarget(cards, "conflict")).toMatchObject({
      card: { id: "conflict" },
      bundleId: "pack:pack",
      packIndex: 2,
    });
  });

  it("returns a standalone card as the only page in its own bundle", () => {
    expect(cardNavigationTarget([card("single")], "single")).toMatchObject({
      card: { id: "single" },
      bundleId: "card:single",
      packIndex: 0,
    });
  });

  it("returns null when pruning or deletion removed both target cards", () => {
    expect(cardNavigationTarget([card("remaining")], "missing")).toBeNull();
  });
});
