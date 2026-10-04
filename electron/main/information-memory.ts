import type { AppLanguage, Card, InformationChangeKind } from "../../src/shared/contracts";

export interface InformationSnapshot {
  title: string;
  content: string;
}

export interface DetectedInformationChange {
  kind: Exclude<InformationChangeKind, "none">;
  previousCardId: string;
  summary: string;
}

const OPPOSITE_STATES = [
  ["开放", "关闭"], ["通车", "封闭"], ["恢复", "暂停"], ["确认", "取消"],
  ["open", "closed"], ["reopened", "suspended"], ["confirmed", "cancelled"],
  ["открыт", "закрыт"], ["подтвержден", "отменен"],
  ["ouvert", "fermé"], ["confirmé", "annulé"],
  ["geöffnet", "geschlossen"], ["bestätigt", "abgesagt"],
  ["開通", "閉鎖"], ["確定", "中止"], ["개방", "폐쇄"], ["확정", "취소"],
] as const;

const LABELS: Record<Exclude<AppLanguage, "system">, { updated: string; conflict: string }> = {
  "zh-CN": { updated: "与既有信息相比出现更新", conflict: "与既有信息存在冲突" },
  en: { updated: "Changed compared with saved information", conflict: "Conflicts with saved information" },
  ru: { updated: "Изменено по сравнению с сохранённой информацией", conflict: "Противоречит сохранённой информации" },
  fr: { updated: "Modification par rapport aux informations enregistrées", conflict: "Contradiction avec les informations enregistrées" },
  de: { updated: "Gegenüber gespeicherten Informationen geändert", conflict: "Widerspricht gespeicherten Informationen" },
  ja: { updated: "保存済み情報から変更されています", conflict: "保存済み情報と矛盾しています" },
  ko: { updated: "저장된 정보와 비교해 변경됨", conflict: "저장된 정보와 충돌함" },
};

export function resolveContentLanguage(language: AppLanguage, systemLocale = "en"): Exclude<AppLanguage, "system"> {
  if (["zh-CN", "en", "ru", "fr", "de", "ja", "ko"].includes(language)) return language as Exclude<AppLanguage, "system">;
  const normalized = systemLocale.toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("ko")) return "ko";
  return "en";
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function tokens(value: string): Set<string> {
  const normalized = normalize(value);
  const result = new Set(normalized.split(/\s+/).filter((token) => token.length >= 2));
  const compactCjk = normalized.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, "");
  for (let index = 0; index < compactCjk.length - 1; index += 1) result.add(compactCjk.slice(index, index + 2));
  return result;
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

function hasOppositeState(previous: string, current: string): boolean {
  const oldValue = previous.toLowerCase();
  const newValue = current.toLowerCase();
  return OPPOSITE_STATES.some(([left, right]) =>
    (oldValue.includes(left) && newValue.includes(right)) || (oldValue.includes(right) && newValue.includes(left)));
}

export function detectInformationChange(
  current: InformationSnapshot,
  history: Card[],
  language: Exclude<AppLanguage, "system">,
): DetectedInformationChange | null {
  const currentText = `${current.title}\n${current.content}`;
  const currentNormalized = normalize(currentText);
  const currentTitleTokens = tokens(current.title);
  const currentTokens = tokens(currentText);
  let best: { card: Card; score: number } | null = null;

  for (const card of history) {
    if (!card.sourceUrl || card.type === "source" || card.type === "note") continue;
    const previousText = `${card.title}\n${card.content}`;
    if (normalize(previousText) === currentNormalized) return null;
    const titleScore = overlap(currentTitleTokens, tokens(card.title));
    const bodyScore = overlap(currentTokens, tokens(previousText));
    const score = titleScore * 0.65 + bodyScore * 0.35;
    if (score >= 0.28 && (!best || score > best.score)) best = { card, score };
  }

  if (!best) return null;
  const conflict = hasOppositeState(best.card.content, current.content);
  const kind = conflict ? "conflict" : "updated";
  return {
    kind,
    previousCardId: best.card.id,
    summary: `${LABELS[language][kind]}: ${best.card.title}`,
  };
}
