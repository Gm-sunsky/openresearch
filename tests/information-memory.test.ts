import { describe, expect, it } from "vitest";
import { detectInformationChange, resolveContentLanguage } from "../electron/main/information-memory";
import type { Card } from "../src/shared/contracts";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "old", projectId: "project", type: "news", title: "独库公路开放状态", content: "独库公路当前开放通车",
    imageUrl: null, sourceUrl: "https://example.com/old", sourceName: "官方", sourceLinks: [{ name: "官方", url: "https://example.com/old" }], focusCategory: "开放状态", occurredAt: null, importance: 3,
    locked: false, updateBatchId: "old-batch", updateBatchAt: "2026-08-01T00:00:00.000Z", changeKind: "none",
    packId: null, packOrder: 0, position: { x: 80, y: 80 }, size: { width: 320, height: 220 },
    createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", ...overrides,
  };
}

describe("information memory", () => {
  it("resolves supported system locales", () => {
    expect(resolveContentLanguage("system", "ja-JP")).toBe("ja");
    expect(resolveContentLanguage("system", "es-ES")).toBe("en");
    expect(resolveContentLanguage("fr", "zh-CN")).toBe("fr");
  });

  it("detects opposite status claims as a conflict", () => {
    const result = detectInformationChange(
      { title: "独库公路开放状态更新", content: "独库公路目前已关闭封闭" },
      [card()],
      "zh-CN",
    );
    expect(result).toMatchObject({ kind: "conflict", previousCardId: "old" });
  });

  it("ignores identical saved information", () => {
    expect(detectInformationChange(
      { title: "独库公路开放状态", content: "独库公路当前开放通车" },
      [card()],
      "zh-CN",
    )).toBeNull();
  });
});
