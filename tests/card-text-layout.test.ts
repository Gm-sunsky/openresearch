import { describe, expect, it } from "vitest";
import { cardTextPlan } from "../src/lib/use-card-text-layout";

describe("card text uses available geometry", () => {
  it("shows the full body when it fits instead of limiting it to the stored overview", () => {
    expect(cardTextPlan(460, 400, 60, 20)).toEqual({ lines: 23, expanded: true, lineHeight: 20 });
  });
  it("uses more than fourteen lines when a long body has room to expand", () => {
    expect(cardTextPlan(480, 1600, 60, 20)).toMatchObject({ lines: 24, expanded: true });
  });
  it("keeps a concise overview when only its own height fits", () => {
    expect(cardTextPlan(200, 1600, 60, 20)).toMatchObject({ lines: 10, expanded: false });
    expect(cardTextPlan(60, 1600, 60, 20)).toMatchObject({ lines: 3, expanded: false });
    expect(cardTextPlan(0, 1600, 60, 20).lines).toBe(0);
  });
});
