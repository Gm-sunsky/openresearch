import type { InformationDepth } from "./contracts";

export function normalizeInformationDepth(value: unknown): InformationDepth {
  return value === "focused" || value === "deep" ? value : "standard";
}

export const INFORMATION_DEPTH_POLICIES = {
  focused: {
    label: "核心事实", maxCharacters: 480, maxFacts: 3, relationHops: 0,
    guidance: "仅回答关注项本身，优先给出确切时间、地点、数值或当前状态。不要展开原因、同期事项和背景介绍。保留必要的来源与不确定性说明。",
  },
  standard: {
    label: "相关背景", maxCharacters: 1100, maxFacts: 6, relationHops: 1,
    guidance: "先直接回答关注项，再补充有来源支持的一层直接原因、条件或相关事项。只保留能帮助理解核心事实的背景，避免泛泛介绍。",
  },
  deep: {
    label: "深入关联", maxCharacters: 2200, maxFacts: 12, relationHops: 2,
    guidance: "先回答核心事实，再追溯有证据支持的原因、同期或关联事项，并简要介绍这些事项。每次扩展必须解释与原关注项的关系，最多两层；未知原因明确标注未知，不能编造因果。",
  },
} as const;

export function informationDepthPolicy(value: unknown) {
  return INFORMATION_DEPTH_POLICIES[normalizeInformationDepth(value)];
}
