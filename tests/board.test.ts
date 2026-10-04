import { describe, expect, it } from "vitest";
import { filterCards } from "../src/lib/card-filter";
import { findPackingTarget, groupCardBundles } from "../src/lib/card-packs";
import { activeUpdateBatch, buildUpdateBatchRegions } from "../src/lib/update-batches";
import type { Card } from "../src/shared/contracts";

const base: Omit<Card, "id" | "type" | "title" | "content"> = {
  projectId: "project", imageUrl: null, sourceUrl: null, sourceName: null, sourceLinks: [], focusCategory: null, occurredAt: null, importance: 2,
  packId: null, packOrder: 0,
  position: { x: 0, y: 0 }, size: { width: 300, height: 200 },
  createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z",
};

const cards: Card[] = [
  { ...base, id: "road", type: "event", title: "独库公路恢复开放", content: "道路已恢复通行" },
  { ...base, id: "music", type: "news", title: "演出公告", content: "新巡演" },
  { ...base, id: "note", type: "note", title: "待确认", content: "核实交通管制", sourceName: "新疆交通" },
];

describe("board filtering", () => {
  it("filters by card type", () => {
    expect(filterCards(cards, "event", "").map((card) => card.id)).toEqual(["road"]);
  });

  it("searches title, content, and source name", () => {
    expect(filterCards(cards, "all", "交通").map((card) => card.id)).toEqual(["note"]);
    expect(filterCards(cards, "all", "公路").map((card) => card.id)).toEqual(["road"]);
  });

  it("groups packed cards in their saved order", () => {
    const packed = [
      { ...cards[0], packId: "pack", packOrder: 1 },
      { ...cards[1], packId: "pack", packOrder: 0 },
      cards[2],
    ];
    const bundles = groupCardBundles(packed);
    expect(bundles).toHaveLength(2);
    expect(bundles.find((bundle) => bundle.packId === "pack")?.cards.map((card) => card.id)).toEqual(["music", "road"]);
  });

  it("detects the lower card when a dragged card center enters it", () => {
    const spaced = [
      { ...cards[0], position: { x: 80, y: 80 } },
      { ...cards[1], position: { x: 440, y: 80 } },
    ];
    expect(findPackingTarget(spaced, "road", { x: 450, y: 90 })).toBe("music");
    expect(findPackingTarget(spaced, "road", { x: 80, y: 500 })).toBeNull();
  });

  it("builds update regions and selects the node nearest the viewport", () => {
    const batched = [
      { ...cards[0], updateBatchId: "older", updateBatchAt: "2026-08-10T08:00:00.000Z", position: { x: 90, y: 300 } },
      { ...cards[1], updateBatchId: "newer", updateBatchAt: "2026-08-11T08:00:00.000Z", position: { x: 90, y: 900 } },
      { ...cards[2], updateBatchId: "newer", updateBatchAt: "2026-08-11T08:00:00.000Z", position: { x: 450, y: 930 } },
    ];
    const regions = buildUpdateBatchRegions(batched);
    expect(regions).toMatchObject([{ id: "older", y: 300, cardCount: 1 }, { id: "newer", y: 900, cardCount: 2 }]);
    expect(activeUpdateBatch(regions, 850)).toBe("older");
    expect(activeUpdateBatch(regions, 920)).toBe("newer");
  });
});
