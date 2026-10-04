import { describe, expect, it } from "vitest";
import { generateProjectDraft } from "../electron/main/project-generator";

describe("generateProjectDraft", () => {
  it("extracts focus items and daily frequency from a natural-language brief", () => {
    const draft = generateProjectDraft({
      prompt: "帮我持续关注 Yorushika 的演出信息。\n- 日本国内演唱会\n- 海外巡演\n每天检查更新。",
    });

    expect(draft.name).toContain("Yorushika");
    expect(draft.focus).toEqual(["日本国内演唱会", "海外巡演"]);
    expect(draft.updateFrequency).toBe("daily");
  });

  it("honors a user-provided name and detects hourly updates", () => {
    const draft = generateProjectDraft({ prompt: "关注 SpaceX 发射，每小时更新", name: "SpaceX Watch" });
    expect(draft.name).toBe("SpaceX Watch");
    expect(draft.updateFrequency).toBe("hourly");
  });

  it("rejects an empty brief", () => {
    expect(() => generateProjectDraft({ prompt: "   " })).toThrow("请描述");
  });
});
