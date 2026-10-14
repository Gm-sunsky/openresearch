import { describe, expect, it } from "vitest";
import { compactUnknownInformation, coverageStatement, unknownLabel } from "../src/shared/unknown-information";
import { synthesisOverview } from "../src/shared/synthesis-preview";

describe("concise unknown information", () => {
  it("uses the authoritative coverage state and preserves confirmed negative facts and conflicts", () => {
    expect(coverageStatement({ status: "no_evidence", statement: "Long explanation" })).toBe("未知");
    for (const status of ["confirmed", "conflict"]) {
      expect(coverageStatement({ status, statement: "官方宣布目前没有开放，公告与售票页不一致。" })).toBe("官方宣布目前没有开放，公告与售票页不一致。");
    }
  });
  it("compacts all-missing previews even when the model supplies verbose output", () => {
    const coverage = [{ entity: "项目甲", status: "no_evidence" as const, statement: "未找到任何资料，没有变化的证据。" }];
    expect(synthesisOverview({ summary: "irrelevant", coverage }, "zh-CN", "未找到项目甲相关资料")).toBe("未知");
    expect(synthesisOverview({ summary: "irrelevant", coverage }, "en", "No evidence for 项目甲")).toBe("Unknown");
  });
  it("compacts stored generated gap paragraphs without removing provenance or effective facts", () => {
    const content = "• 作品甲：截至本次更新，已核对 6 条来源材料，但没有找到可直接支持“开票日期”的证据。\n• 已检查对象：作品甲。这表示当前来源覆盖不足，不代表确定没有变化。\n• 作品乙：官方确认10月14日不开放。\n• 证据截止：2026-10-14\n• 可信度：低";
    expect(compactUnknownInformation(content)).toBe("• 作品甲：未知\n• 作品乙：官方确认10月14日不开放。\n• 证据截止：2026-10-14\n• 可信度：低");
  });
  it("does not blindly classify arbitrary missing or negative words as unknown", () => {
    const content = "• 官方未找到失踪人员，搜救继续。\n\n• 没有找到停车位的游客可乘接驳车。\n• 尚未开放；本周不会售票。\n• No tickets are available, according to the venue.";
    expect(compactUnknownInformation(content)).toBe(content);
  });
  it("supports English generated boilerplate and all supported output languages", () => {
    expect(compactUnknownInformation("• Alpha: No citable evidence; coverage gap, not proof of no change.\n• Confidence: Low", "en")).toBe("• Alpha: Unknown\n• Confidence: Low");
    expect(unknownLabel("ja")).toBe("不明");
    expect(unknownLabel("de")).toBe("Unbekannt");
  });
});
