import { describe, expect, it } from "vitest";
import { synthesisOverview } from "../src/shared/synthesis-preview";
import { selectCardImages, safeImage } from "../electron/main/image-evidence";

describe("independent synthesis overview", () => {
  it("covers all entities and material states when the first entity has lengthy details", () => {
    const overview = synthesisOverview({ summary: "ignored", coverage: [
      { entity: "作品甲", status: "confirmed", statement: "8月24日播出。" + "背景资料".repeat(300) },
      { entity: "作品乙", status: "conflict", statement: "节目表分歧。" },
      { entity: "作品丙", status: "no_evidence", statement: "没有证据。" },
    ] });
    expect(overview.length).toBeLessThanOrEqual(160);
    expect(overview).toContain("3个对象");
    expect(overview).toContain("1有分歧");
    expect(overview).toContain("作品甲：8月24日播出");
    expect(overview).toContain("作品乙：分歧");
    expect(overview).toContain("作品丙：缺证据");
  });
  it("does not silently accept a preview that only covers the first entity", () => {
    expect(synthesisOverview({ summary: "", coverage: [
      { entity: "甲", status: "confirmed", statement: "已开放。" },
      { entity: "乙", status: "no_evidence", statement: "缺证据。" },
    ] }, "zh-CN", "甲已开放")).toContain("乙：缺证据");
  });
  it("selects core images but retains uncaptained and background images for the reader", () => {
    const overview = synthesisOverview({ summary: "Falcon rocket launch confirmed.\nMuseum restoration background." }, "en", "Falcon rocket launch confirmed.");
    const images = [safeImage("https://example.org/a.jpg", "Falcon rocket launch confirmed", "https://example.org/source")!,
      safeImage("https://example.org/b.jpg", "Museum restoration exhibit", "https://example.org/source")!,
      safeImage("https://example.org/c.jpg", null, "https://example.org/source")!];
    const selected = selectCardImages(images, overview);
    expect(selected.imageUrl).toBe(images[0].url);
    expect(selected.images).toHaveLength(3);
    expect(selected.images.find((image) => image.url === images[1].url)?.relevance).toBe("unverified");
    expect(selected.images.find((image) => image.url === images[2].url)?.relevance).toBe("unverified");
  });
});


it("does not turn an evidence gap into a confident independent preview", () => {
  const preview = synthesisOverview({ summary: "", coverage: [
    { entity: "甲", status: "confirmed", statement: "已开放。" },
    { entity: "乙", status: "no_evidence", statement: "没有可靠证据。" },
  ] }, "zh-CN", "甲乙均已确认开放。");
  expect(preview).toContain("乙：缺证据");
});

it("keeps decimal prices and dotted dates intact in extractive overviews", () => {
  expect(synthesisOverview({ summary: "票价18.50元。其余背景。\n开票日期2026.10.08。" })).toContain("18.50元");
  expect(synthesisOverview({ summary: "票价18.50元。其余背景。\n开票日期2026.10.08。" })).toContain("2026.10.08");
});
