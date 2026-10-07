import { describe, expect, it } from "vitest";
import { normalizeCardImages, summarizeCard } from "../src/shared/card-presentation";

describe("card previews and material images", () => {
  it("extracts a bounded preview without rewriting facts", () => {
    const full = "• 开票时间为10月8日18:00。\n• 场地为大阪城Hall。\n" + "扩展背景资料。".repeat(80) + "\n可信度：中等";
    const summary = summarizeCard(full, 70);
    expect(summary.length).toBeLessThanOrEqual(70);
    expect(summary).toContain("10月8日18:00");
    expect(summary).not.toContain("可信度");
    expect(full).toContain("扩展背景资料。".repeat(80));
    expect(summarizeCard(full, 1)).toBe("…");
  });
  it("requires a real caption before marking a picture relevant", () => {
    expect(normalizeCardImages([{ url: "https://example.com/photo.jpg", caption: null, relevance: "relevant" }])[0].relevance).toBe("unverified");
    expect(normalizeCardImages([{ url: "javascript:alert(1)", caption: "bad" }, { url: "file:///secret.png" }])).toEqual([]);
    const images = normalizeCardImages([{ url: "https://example.com/photo.jpg", caption: null }, { url: "https://example.com/photo.jpg", caption: "Concert poster with ticket date", relevance: "relevant" }]);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ relevance: "relevant", caption: "Concert poster with ticket date" });
  });
});

it("preserves long image descriptions for full material display", () => {
  const caption = "完整图注。".repeat(700);
  expect(normalizeCardImages([{ url: "https://example.com/poster.jpg", caption, relevance: "unverified" }])[0].caption).toBe(caption);
});