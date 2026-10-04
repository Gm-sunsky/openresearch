import { describe, expect, it } from "vitest";
import { cardContentLayout, resizeCardFrame } from "../src/lib/card-resize";

describe("card resizing", () => {
  it("resizes from an edge while keeping the opposite edge fixed", () => {
    expect(resizeCardFrame({ x: 100, y: 80 }, { width: 320, height: 240 }, "nw", { x: -40, y: -30 })).toEqual({
      position: { x: 60, y: 50 }, size: { width: 360, height: 270 },
    });
  });
  it("enforces minimum size and board inset", () => {
    expect(resizeCardFrame({ x: 30, y: 30 }, { width: 320, height: 240 }, "nw", { x: -500, y: -500 })).toEqual({
      position: { x: 24, y: 24 }, size: { width: 326, height: 246 },
    });
    expect(resizeCardFrame({ x: 100, y: 100 }, { width: 320, height: 240 }, "se", { x: -500, y: -500 }).size).toEqual({ width: 240, height: 170 });
  });
  it("keeps an image visible even in the minimum card and reserves header and footer space", () => {
    for (const size of [{ width: 240, height: 170 }, { width: 299, height: 380 }, { width: 360, height: 319 }]) {
      const result = cardContentLayout(size, true, { width: 800, height: 1200 });
      expect(result.showImage).toBe(true);
      expect(result.imageHeight).toBeGreaterThan(0);
      expect(result.imageHeight).toBeLessThan(size.height - 100);
    }
    expect(cardContentLayout({ width: 240, height: 170 }, false).showImage).toBe(false);
  });
  it("uses natural aspect ratios while keeping extreme images inside the card", () => {
    const size = { width: 400, height: 500 };
    const wide = cardContentLayout(size, true, { width: 2400, height: 300 });
    const portrait = cardContentLayout(size, true, { width: 300, height: 2400 });
    expect(wide.imageHeight).toBeCloseTo((size.width - 40) / 8);
    expect(portrait.imageHeight).toBeGreaterThan(wide.imageHeight);
    expect(portrait.imageHeight).toBeLessThanOrEqual(size.height * .52);
    for (const invalid of [{ width: 0, height: 0 }, { width: Infinity, height: 10 }, { width: 3, height: NaN }]) {
      expect(Number.isFinite(cardContentLayout(size, true, invalid).imageHeight)).toBe(true);
    }
  });
});
