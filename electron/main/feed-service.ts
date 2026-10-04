import { informationDepthPolicy } from "../../src/shared/information-depth";
import { mapConcurrent } from "./concurrency";
import { XMLParser } from "fast-xml-parser";
import type { AppLanguage, Card, CardSourceLink, CardType, CreateCardInput, Project, Source, UpdateRunResult } from "../../src/shared/contracts";
import { AiApiClient, type InformationItemInput, type OrganizedInformation, type SynthesizedInformation } from "./ai-client";
import { hashContent, ResearchDatabase } from "./database";
import { detectInformationChange, resolveContentLanguage } from "./information-memory";
import { buildResearchWorkflow, classifyEvidenceTier, limitResearchText } from "./research-workflow";

export interface FeedItem {
  title: string;
  link: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: string | null;
}

export interface PageDetails {
  title: string;
  description: string;
  imageUrl: string | null;
}

interface CollectedInformation extends InformationItemInput {
  sourceName: string;
  imageUrl: string | null;
  suggestedType: Extract<CardType, "news" | "event" | "timeline" | "analysis">;
  suggestedImportance: number;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return textValue(record["#text"] ?? record.__cdata ?? record.href ?? "");
  }
  return "";
}

export function stripMarkup(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string, maxLength = 560): string {
  const normalized = stripMarkup(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}…` : normalized;
}

function objectAttribute(value: unknown, attribute: string): string {
  if (!value || typeof value !== "object") return "";
  const field = (value as Record<string, unknown>)[attribute];
  return typeof field === "string" || typeof field === "number" ? String(field).trim() : "";
}

function imageFromMarkup(value: string): string {
  for (const tag of value.match(/<img\b[^>]*>/gi) ?? []) {
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
    const hint = `${src} ${tag.match(/\b(?:alt|class|id)=["']([^"']*)["']/i)?.[1] ?? ""}`;
    const width = Number(tag.match(/\bwidth=["']?(\d+)/i)?.[1] ?? 0);
    const height = Number(tag.match(/\bheight=["']?(\d+)/i)?.[1] ?? 0);
    if (!src || /logo|icon|avatar|emoji|spacer|tracking|pixel/i.test(hint)) continue;
    if ((width > 0 && width < 120) || (height > 0 && height < 80)) continue;
    return src;
  }
  return "";
}

function feedImage(record: Record<string, unknown>, rawContent: string): string | null {
  const mediaContent = toArray(record["media:content"] as Record<string, unknown> | undefined)
    .find((item) => /^image\//i.test(objectAttribute(item, "type")) || Boolean(objectAttribute(item, "url")));
  const mediaThumbnail = toArray(record["media:thumbnail"] as Record<string, unknown> | undefined)[0];
  const enclosure = toArray(record.enclosure as Record<string, unknown> | undefined)
    .find((item) => /^image\//i.test(objectAttribute(item, "type")));
  return objectAttribute(mediaContent, "url")
    || objectAttribute(mediaThumbnail, "url")
    || objectAttribute(enclosure, "url")
    || imageFromMarkup(rawContent)
    || null;
}

export function parseFeed(xml: string): FeedItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as { channel?: Record<string, unknown> } | undefined;
  const channel = rss?.channel;

  if (channel) {
    return toArray(channel.item as Record<string, unknown> | Array<Record<string, unknown>> | undefined)
      .map((item) => {
        const rawContent = textValue(item["content:encoded"]) || textValue(item.description);
        return {
          title: textValue(item.title).trim(),
          link: textValue(item.link).trim() || textValue(item.guid).trim(),
          summary: stripMarkup(rawContent).slice(0, 12_000),
          imageUrl: feedImage(item, rawContent),
          publishedAt: textValue(item.pubDate).trim() || null,
        };
      })
      .filter((item) => item.title && item.link);
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  return toArray(feed?.entry as Record<string, unknown> | Array<Record<string, unknown>> | undefined)
    .map((entry) => {
      const links = toArray(entry.link as Record<string, unknown> | string | undefined);
      const alternate = links.find((link) => (
        typeof link === "object"
        && link !== null
        && "rel" in link
        && (link as Record<string, unknown>).rel === "alternate"
      )) ?? links[0];
      const rawContent = textValue(entry.content) || textValue(entry.summary);
      return {
        title: textValue(entry.title).trim(),
        link: textValue(alternate).trim() || textValue(entry.id).trim(),
        summary: stripMarkup(rawContent).slice(0, 12_000),
        imageUrl: feedImage(entry, rawContent),
        publishedAt: textValue(entry.published || entry.updated).trim() || null,
      };
    })
    .filter((item) => item.title && item.link);
}

function titleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return compact(match?.[1] ?? fallback, 120) || fallback;
}

function tagAttribute(tag: string, name: string): string {
  const expression = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  return tag.match(expression)?.[1]?.trim() ?? "";
}

function metaValue(html: string, names: string[]): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (tagAttribute(tag, "property") || tagAttribute(tag, "name")).toLowerCase();
    if (names.includes(key)) return tagAttribute(tag, "content");
  }
  return "";
}

function resolveHttpUrl(candidate: string | null | undefined, baseUrl: string): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function extractPageDetails(html: string, url: string, fallbackTitle = "网页更新"): PageDetails {
  const description = metaValue(html, ["description", "og:description", "twitter:description"]);
  const socialImage = metaValue(html, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]);
  const imageLink = (html.match(/<link\b[^>]*\brel=["']image_src["'][^>]*>/i)?.[0]
    ?? html.match(/<link\b[^>]*\bhref=["'][^"']+["'][^>]*\brel=["']image_src["'][^>]*>/i)?.[0]);
  const fallbackImage = imageFromMarkup(html);
  return {
    title: titleFromHtml(html, fallbackTitle),
    description: compact([description, html].filter(Boolean).join(" "), 12_000),
    imageUrl: resolveHttpUrl(socialImage || (imageLink ? tagAttribute(imageLink, "href") : "") || fallbackImage, url),
  };
}

function projectKeywords(project: Project): string[] {
  const generic = new Set(["信息", "相关", "情况", "最新", "关注", "追踪", "项目", "官方", "新闻", "公告", "update", "news", "official", "track"]);
  return [...new Set([project.name, project.description, project.goal, ...project.focus]
    .flatMap((value) => value.toLowerCase().split(/[\s,，。；;、/|：:（）()-]+/))
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && !generic.has(value)))]
    .slice(0, 24);
}

function informationSentences(value: string): string[] {
  return stripMarkup(value)
    .slice(0, 20_000)
    .split(/(?<=[。！？!?；;])\s*|(?<=\.)\s+(?=[A-Z0-9\u4e00-\u9fff])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8 && !/^(首页|导航|菜单|登录|注册|copyright|all rights reserved)/i.test(sentence));
}

export function extractCoreInformation(project: Project, title: string, value: string): string {
  const keywords = projectKeywords(project);
  const sentences = informationSentences(value);
  const statusPattern = /开放|封闭|恢复|暂停|确认|新增|取消|延期|发售|售票|时间|地点|票价|期限|截至|open|close|resume|cancel|confirm|ticket|date|time|location/i;
  const ranked = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    const keywordHits = keywords.filter((keyword) => lower.includes(keyword)).length;
    const score = keywordHits * 4 + (statusPattern.test(sentence) ? 2 : 0) + (/\d/.test(sentence) ? 1 : 0) - index * 0.015;
    return { sentence, index, score };
  });
  const selected = ranked
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .sort((left, right) => left.index - right.index)
    .map(({ sentence }) => sentence.replace(new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-—:：]?\\s*`, "i"), "").slice(0, 220))
    .filter(Boolean);
  if (!selected.length) return "来源未提供可提取的核心信息，请打开原文查看。";
  return selected.map((sentence) => `• ${sentence}`).join("\n");
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "user-agent": "OpenResearch/0.1 (+local desktop monitor)",
      accept: "text/html, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("响应内容超过 5 MB 限制");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error("响应内容超过 5 MB 限制");
  return text;
}

function dedupeSourceLinks(links: CardSourceLink[]): CardSourceLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (!/^https?:\/\//i.test(link.url) || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

const FOCUS_SEMANTICS: Array<{ focus: RegExp; terms: string[] }> = [
  { focus: /播出时间|放送时间|更新时间|更新日历|schedule|calendar|air\s*date/i, terms: ["放送日", "放送時間", "放送開始", "番組表", "オンエア", "schedule", "calendar", "air date", "premiere", "播出", "更新", "档期", "改期", "変更"] },
  { focus: /停播|分期|延期|取消|暂停|hiatus|delay|cancel|split/i, terms: ["放送休止", "休止", "延期", "中止", "分割", "クール", "delay", "delayed", "hiatus", "cancelled", "split cour", "停播", "分期", "延期", "取消"] },
  { focus: /监督|監督|演出|制作|staff|director|episode/i, terms: ["監督", "演出", "スタッフ", "staff", "director", "episode director", "絵コンテ", "脚本", "分镜", "监督", "演出"] },
  { focus: /演唱会|公演|巡演|concert|tour|live/i, terms: ["公演", "ライブ", "ツアー", "live", "concert", "tour", "venue", "会場", "演唱会", "巡演"] },
  { focus: /售票|票价|抽选|ticket|presale/i, terms: ["チケット", "先行", "抽選", "一般発売", "ticket", "presale", "lottery", "售票", "票价", "开票", "抽选"] },
  { focus: /公告|动态|news|announcement/i, terms: ["お知らせ", "ニュース", "発表", "announcement", "official", "公告", "宣布", "最新消息"] },
  { focus: /发射|launch|liftoff/i, terms: ["发射", "点火", "升空", "launch", "liftoff", "static fire", "打ち上げ"] },
  { focus: /回收|着陆|recovery|landing/i, terms: ["回收", "着陆", "回收场", "recovery", "landing", "再使用", "再利用"] },
  { focus: /开放|封闭|通行|road|closure/i, terms: ["开放", "封闭", "通行", "交通管制", "open", "closed", "closure", "traffic", "開通", "通行止め"] },
];

function focusTerms(focus: string): string[] {
  const normalized = focus.toLocaleLowerCase();
  const direct = normalized.split(/[\s,，。；;、/|：:（）()-]+/).map((token) => token.trim()).filter((token) => token.length >= 2);
  const semantic = FOCUS_SEMANTICS.filter((group) => group.focus.test(focus)).flatMap((group) => group.terms);
  return [...new Set([...direct, ...semantic].map((term) => term.toLocaleLowerCase()))];
}

function focusScore(focus: string, item: Pick<CollectedInformation, "title" | "content" | "researchEntity" | "researchTask"> & { sourceName?: string }): number {
  const haystack = `${item.title} ${item.content}`.toLocaleLowerCase();
  const normalized = focus.toLocaleLowerCase();
  return (haystack.includes(normalized) ? 8 : 0) + focusTerms(focus).filter((term) => haystack.includes(term)).length * 2;
}

function focusForInformation(project: Project, item: Pick<CollectedInformation, "title" | "content" | "researchEntity" | "researchTask"> & { sourceName?: string }): string {
  return project.focus.map((focus, index) => ({ focus, index, score: focusScore(focus, item) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.focus ?? project.name;
}

interface LocalSnapshotCopy {
  title(focus: string): string;
  noReadable: string;
  noMatch: string;
  aiFailed(reason: string): string;
  coverageGap(focus: string, evidenceCount: number, entities: string[]): string;
}

const LOCAL_SNAPSHOT_COPY: Record<Exclude<AppLanguage, "system">, LocalSnapshotCopy> = {
  "zh-CN": { title: (focus) => `${focus}：最新状态`, noReadable: "• 本次没有采集到可读取的正文，请检查来源错误。", noMatch: "• 已采集到来源正文，但没有找到与该关注项直接匹配的内容。", aiFailed: () => "• 已根据本次采集证据生成本地核对结果。", coverageGap: (focus, count, entities) => `• 截至本次更新，已核对 ${count} 条来源材料，但没有找到可直接支持“${focus}”的证据。\n• 已检查对象：${entities.join("、")}。这表示当前来源覆盖不足，不代表确定没有变化。` },
  en: { title: (focus) => `${focus}: latest snapshot`, noReadable: "• No readable source content was collected; check source errors.", noMatch: "• Source content was collected, but none matched this focus directly.", aiFailed: () => "• A reviewable local result was generated from the evidence collected in this update.", coverageGap: (focus, count, entities) => `• This update checked ${count} source items but found no evidence directly supporting “${focus}”.\n• Checked entities: ${entities.join(", ")}. This indicates a coverage gap, not proof that nothing changed.` },
  ru: { title: (focus) => `${focus}: актуальная сводка`, noReadable: "• Читаемый текст источников не получен; проверьте ошибки источников.", noMatch: "• Текст источников получен, но прямого соответствия этой теме нет.", aiFailed: () => "• На основе собранных в этом обновлении данных сформирован локальный результат для проверки.", coverageGap: (focus, count, entities) => `• Проверено материалов: ${count}; прямых доказательств по теме «${focus}» не найдено.\n• Проверенные объекты: ${entities.join(", ")}. Это пробел в охвате, а не подтверждение отсутствия изменений.` },
  fr: { title: (focus) => `${focus} : état actuel`, noReadable: "• Aucun contenu source lisible n’a été collecté ; vérifiez les erreurs.", noMatch: "• Du contenu a été collecté, mais aucun élément ne correspond directement à ce sujet.", aiFailed: () => "• Un résultat local vérifiable a été produit à partir des éléments collectés lors de cette mise à jour.", coverageGap: (focus, count, entities) => `• ${count} éléments ont été vérifiés, sans preuve directe pour « ${focus} ».\n• Entités vérifiées : ${entities.join(", ")}. Il s’agit d’une lacune de couverture, pas d’une preuve d’absence de changement.` },
  de: { title: (focus) => `${focus}: aktueller Stand`, noReadable: "• Es wurden keine lesbaren Quelltexte erfasst; prüfen Sie die Quellenfehler.", noMatch: "• Quelltexte wurden erfasst, aber nichts passt direkt zu diesem Schwerpunkt.", aiFailed: () => "• Aus den in diesem Update gesammelten Belegen wurde ein lokal prüfbares Ergebnis erstellt.", coverageGap: (focus, count, entities) => `• ${count} Quellenbeiträge wurden geprüft, aber es gibt keinen direkten Beleg für „${focus}“.\n• Geprüfte Objekte: ${entities.join(", ")}. Dies ist eine Abdeckungslücke und kein Beweis dafür, dass sich nichts geändert hat.` },
  ja: { title: (focus) => `${focus}：最新状況`, noReadable: "• 読み取れる本文を取得できませんでした。情報源のエラーを確認してください。", noMatch: "• 本文は取得できましたが、この注目項目に直接一致する内容は見つかりませんでした。", aiFailed: () => "• 今回収集した根拠から、確認可能なローカル結果を作成しました。", coverageGap: (focus, count, entities) => `• ${count}件の情報を確認しましたが、「${focus}」を直接裏付ける証拠は見つかりませんでした。\n• 確認対象：${entities.join("、")}。これは情報源のカバレッジ不足であり、変化がないことの証明ではありません。` },
  ko: { title: (focus) => `${focus}: 최신 현황`, noReadable: "• 읽을 수 있는 출처 본문을 수집하지 못했습니다. 출처 오류를 확인하세요.", noMatch: "• 출처 본문은 수집했지만 이 관심 항목과 직접 일치하는 내용이 없습니다.", aiFailed: () => "• 이번 업데이트에서 수집한 근거로 검토 가능한 로컬 결과를 생성했습니다.", coverageGap: (focus, count, entities) => `• 자료 ${count}건을 확인했지만 “${focus}”를 직접 뒷받침하는 근거를 찾지 못했습니다.\n• 확인 대상: ${entities.join(", ")}. 이는 출처 범위 부족이며 변화가 없다는 증거가 아닙니다.` },
};

function localEvidenceText(item: CollectedInformation, focus: string, project: Project): string {
  const policy = informationDepthPolicy(project.informationDepth);
  const sentences = item.content.split(/(?<=[。！？!?])\s*|\n+|(?<=\.)\s+(?=[A-Z])/u)
    .map((line) => line.replace(/^\s*[•*-]\s*/, "").trim()).filter(Boolean);
  const background = /^(?:关联事项介绍|相关事项介绍|这些事项的介绍|二层背景|背景介绍|related event background|background introduction)/i;
  const related = /^(?:原因|因为|由于|同期|相关事项|关联事项|背景|reason|because|due to|related event|at the same time)/i;
  const core = sentences.filter((line) => !related.test(line) && !background.test(line)
    && focusScore(focus, { title: "", content: line }) > 0);
  if (!core.length && focusScore(focus, { title: item.title, content: "" }) > 0) {
    const first = sentences.find((line) => !related.test(line) && !background.test(line));
    if (first) core.push(first);
  }
  // A query's task label or source name is not evidence that its result answers it.
  if (!core.length) return "";
  const firstLayer = policy.relationHops > 0 ? sentences.filter((line) => related.test(line) && !background.test(line)) : [];
  const secondLayer = policy.relationHops > 1 && firstLayer.length > 0 ? sentences.filter((line) => background.test(line)) : [];
  return limitResearchText([...new Set([...core, ...firstLayer, ...secondLayer])].join("\n"), project.informationDepth, 12_000, 100, focus);
}

function localSynthesis(
  project: Project,
  items: CollectedInformation[],
  language: Exclude<AppLanguage, "system">,
  failureReason?: string,
): SynthesizedInformation[] {
  const copy = LOCAL_SNAPSHOT_COPY[language];
  const workflow = buildResearchWorkflow(project);
  const policy = informationDepthPolicy(project.informationDepth);
  const asOf = new Date().toISOString();
  return project.focus.map((focusCategory) => {
    const ranked = items.filter((item) => !item.researchTask || item.researchTask === focusCategory)
      .map((item) => ({ item, score: focusScore(focusCategory, item), text: localEvidenceText(item, focusCategory, project) }))
      .filter((entry) => entry.score > 0 && entry.text)
      .sort((left, right) => right.score - left.score || right.item.suggestedImportance - left.item.suggestedImportance);
    const status = failureReason ? copy.aiFailed(failureReason) : "";
    // Reserve every entity a visible row before spending the remaining space on detail.
    const rowBudget = Math.floor((policy.maxCharacters - status.length - (status ? 1 : 0) - workflow.entities.length + 1) / workflow.entities.length);
    const factBudget = Math.max(1, Math.floor(policy.maxFacts / workflow.entities.length));
    const coverage = workflow.entities.map((entity) => {
      const entityEvidence = ranked.filter(({ item }) => item.researchEntity
        ? item.researchEntity === entity
        : workflow.entities.length === 1 || `${item.title} ${item.content}`.toLocaleLowerCase().includes(entity.toLocaleLowerCase()));
      const label = entity;
      const maxCharacters = Math.max(20, rowBudget - label.length - 3);
      const statement = entityEvidence.length
        ? limitResearchText(entityEvidence.map((entry) => entry.text.startsWith(entity) ? entry.text.slice(entity.length).trimStart() : entry.text).join("\n"), project.informationDepth, maxCharacters, factBudget, focusCategory)
        : limitResearchText(items.length === 0 ? copy.noReadable : copy.coverageGap(focusCategory, items.length, [entity]), project.informationDepth, maxCharacters, factBudget, focusCategory);
      return {
        entity,
        status: entityEvidence.length ? "confirmed" as const : "no_evidence" as const,
        statement,
        sourceIndexes: entityEvidence.map(({ item }) => item.index),
        label,
      };
    });
    const evidence = ranked.filter(({ item }) => coverage.some((row) => row.sourceIndexes.includes(item.index))).map(({ item }) => item);
    const strongest = evidence[0];
    const summary = [status, ...coverage.map((row) => `• ${row.label}：${row.statement}`)].filter(Boolean).join("\n");
    const confidence: SynthesizedInformation["confidence"] = failureReason || coverage.some((row) => row.status === "no_evidence")
      || evidence.some((item) => item.evidenceTier === "community")
      ? "low"
      : evidence.some((item) => !item.evidenceTier || item.evidenceTier === "specialist") ? "medium" : "high";
    return {
      focusCategory,
      sourceIndexes: evidence.map((item) => item.index),
      coverage: coverage.map(({ entity, status: coverageStatus, statement, sourceIndexes }) => ({ entity, status: coverageStatus, statement, sourceIndexes })),
      asOf,
      confidence,
      type: strongest?.suggestedType ?? "analysis",
      title: copy.title(focusCategory),
      summary,
      importance: strongest?.suggestedImportance ?? 1,
      occurredAt: evidence.find((item) => item.publishedAt)?.publishedAt ?? null,
      changeKind: "none",
      previousCardId: null,
      changeSummary: null,
    };
  });
}

function completeFocusSnapshots(
  project: Project,
  cards: SynthesizedInformation[],
  language: Exclude<AppLanguage, "system">,
  collectedItems: CollectedInformation[],
): SynthesizedInformation[] {
  const copy = LOCAL_SNAPSHOT_COPY[language];
  const workflow = buildResearchWorkflow(project);
  const localCards = localSynthesis(project, collectedItems, language);
  const emptySummary = /当前来源未提供可确认的信息|暂无可确认的信息|no (?:confirmed|verifiable|readable) information|aucune information confirmée|keine bestätigten informationen|確認できる情報はありません|확인 가능한 정보가 없습니다/i;
  return project.focus.map((focusCategory) => {
    const aiCard = cards.find((card) => card.focusCategory === focusCategory);
    const validAiSources = aiCard?.sourceIndexes.filter((index) => collectedItems.some((item) => item.index === index)) ?? [];
    if (aiCard && validAiSources.length > 0 && !emptySummary.test(aiCard.summary)) {
      return { ...aiCard, sourceIndexes: validAiSources };
    }
    const localCard = localCards.find((card) => card.focusCategory === focusCategory);
    if (localCard) return localCard;
    return {
      focusCategory,
      sourceIndexes: [],
      coverage: workflow.entities.map((entity) => ({
        entity,
        status: "no_evidence" as const,
        statement: copy.coverageGap(focusCategory, collectedItems.length, [entity]).replace(/^•\s*/, "").replace(/\n•\s*/g, " "),
        sourceIndexes: [],
      })),
      asOf: new Date().toISOString(),
      confidence: "low",
      type: "analysis",
      title: copy.title(focusCategory),
      summary: collectedItems.length > 0
        ? copy.coverageGap(focusCategory, collectedItems.length, workflow.entities)
        : copy.noReadable,
      importance: 1,
      occurredAt: null,
      changeKind: "none",
      previousCardId: null,
      changeSummary: null,
    };
  });
}

function renderSynthesizedContent(decision: SynthesizedInformation, language: Exclude<AppLanguage, "system">): string {
  const labels: Record<Exclude<AppLanguage, "system">, { asOf: string; confidence: string; levels: Record<SynthesizedInformation["confidence"], string> }> = {
    "zh-CN": { asOf: "证据截止", confidence: "可信度", levels: { high: "高", medium: "中", low: "低" } },
    en: { asOf: "Evidence cutoff", confidence: "Confidence", levels: { high: "High", medium: "Medium", low: "Low" } },
    ru: { asOf: "Срез данных", confidence: "Достоверность", levels: { high: "Высокая", medium: "Средняя", low: "Низкая" } },
    fr: { asOf: "Date de référence", confidence: "Confiance", levels: { high: "Élevée", medium: "Moyenne", low: "Faible" } },
    de: { asOf: "Datenstand", confidence: "Vertrauen", levels: { high: "Hoch", medium: "Mittel", low: "Niedrig" } },
    ja: { asOf: "情報基準日", confidence: "信頼度", levels: { high: "高", medium: "中", low: "低" } },
    ko: { asOf: "근거 기준일", confidence: "신뢰도", levels: { high: "높음", medium: "중간", low: "낮음" } },
  };
  const copy = labels[language];
  return `${decision.summary}\n• ${copy.asOf}：${decision.asOf}\n• ${copy.confidence}：${copy.levels[decision.confidence]}`;
}

export class FeedService {
  private readonly runningProjects = new Set<string>();

  constructor(
    private readonly database: ResearchDatabase,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly ai?: AiApiClient,
  ) {}

  async runProject(projectId: string): Promise<UpdateRunResult> {
    if (this.runningProjects.has(projectId)) throw new Error("该项目正在检查中");
    this.runningProjects.add(projectId);
    let runId: string | undefined;
    try {
    const project = this.database.getProject(projectId);
    if (!project) throw new Error("项目不存在");
    runId = this.database.startTaskRun(projectId, "update");
    const sources = this.database.listSources(projectId).filter((source) => source.status !== "paused");
    const previousCards = this.database.listCards(projectId);
    const batchAt = new Date().toISOString();
    const batchBaseY = this.database.getNextUpdateBatchY(projectId);
    const preferences = this.ai && typeof this.ai.getPreferences === "function"
      ? this.ai.getPreferences()
      : { language: "system" as AppLanguage, maxUpdateBatches: 20 };
    const contentLanguage = resolveContentLanguage(preferences.language);
    let newCards = 0;
    const collected: CollectedInformation[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const createdBatchCards: Card[] = [];

      const directWork = mapConcurrent(sources.filter((source) => source.type !== "search"), 4, async (source) => {
        try {
          return await this.collectSource(project, source);
        } catch (error) {
          const message = error instanceof Error ? error.message : "未知错误";
          errors.push(source.name + "：" + message);
          this.database.updateSourceCheck(source.id, { status: "error", error: message });
          return [];
        }
      });
      const searchSources = sources.filter((source) => source.type === "search");
      const groups = Array.from({ length: Math.ceil(searchSources.length / 16) }, (_, index) => searchSources.slice(index * 16, index * 16 + 16));
      const searchWork = mapConcurrent(groups, 2, async (sourceGroup): Promise<CollectedInformation[]> => {
        try {
          if (!this.ai?.canSearchWeb()) throw new Error("需要支持 web_search 的 Responses API");
          const searchedItems = await this.ai.searchLatestFromSources(project, sourceGroup);
          const groupItems: CollectedInformation[] = [];
          for (const item of searchedItems) {
            const source = sourceGroup[item.sourceIndex];
            if (!source) continue;
            groupItems.push({
              ...item,
              index: 0,
              sourceName: source.name,
              imageUrl: item.imageUrl ?? null,
              evidenceTier: classifyEvidenceTier(source),
              suggestedType: inferCardType(item.title),
              suggestedImportance: inferImportance(item.title),
            });
          }
          for (const [sourceIndex, source] of sourceGroup.entries()) {
            const sourceItems = searchedItems.filter((item) => item.sourceIndex === sourceIndex);
            this.database.updateSourceCheck(source.id, {
              contentHash: hashContent(JSON.stringify(sourceItems.map((item) => [item.url, item.title, item.content]))),
              contentExcerpt: sourceItems.slice(0, 3).map((item) => item.title).join("\n") || null,
              status: "active", error: null,
            });
          }
          return groupItems;
        } catch (error) {
          const message = error instanceof Error ? error.message : "新媒体搜索失败";
          for (const source of sourceGroup) {
            errors.push(source.name + "：" + message);
            this.database.updateSourceCheck(source.id, { status: "error", error: message });
          }
          return [];
        }
      });
      const matrixWork = (async (): Promise<CollectedInformation[]> => {
        if (typeof this.ai?.searchResearchWorkflow !== "function" || !this.ai.canSearchWeb()) return [];
        try {
          const researchedItems = await this.ai.searchResearchWorkflow(project);
          if (researchedItems.length === 0) warnings.push("研究矩阵网页搜索已完成，但没有返回可引用的事实");
          return researchedItems.filter((item) => /^https?:\/\//i.test(item.url)).map((item) => ({
            ...item,
            sourceName: item.sourceName || new URL(item.url).hostname,
            imageUrl: item.imageUrl ?? null,
            suggestedType: inferCardType(item.researchTask + " " + item.title),
            suggestedImportance: item.evidenceTier === "primary" || item.evidenceTier === "operator" ? 3 : 2,
          }));
        } catch (error) {
          warnings.push("研究矩阵网页搜索失败：" + (error instanceof Error ? error.message : "未知错误"));
          return [];
        }
      })();
      const [directItems, searchItems, matrixItems] = await Promise.all([directWork, searchWork, matrixWork]);
      const seen = new Set<string>();
      for (const item of [...directItems.flat(), ...searchItems.flat(), ...matrixItems]) {
        const key = JSON.stringify([item.researchEntity ?? "", item.researchTask ?? "", item.url, item.content]);
        if (seen.has(key)) continue;
        seen.add(key);
        collected.push({ ...item, index: collected.length });
      }
      if (!this.database.getProject(projectId)) throw new Error("项目已删除，已停止本次更新");
      const synthesized = completeFocusSnapshots(
        project,
        await this.synthesize(project, collected, warnings, previousCards, contentLanguage),
        contentLanguage,
        collected,
      );
      if (!this.database.getProject(projectId)) throw new Error("项目已删除，已停止本次更新");
      for (const decision of synthesized) {
        const evidence = decision.sourceIndexes
          .map((itemIndex) => collected.find((item) => item.index === itemIndex))
          .filter((item): item is CollectedInformation => Boolean(item));
        const sourceLinks = dedupeSourceLinks(evidence.map((item) => ({ name: item.sourceName, url: item.url })));
        const imageUrl = evidence.find((item) => item.imageUrl)?.imageUrl ?? null;
        const fingerprint = hashContent(JSON.stringify({
          batch: runId,
          focus: decision.focusCategory,
          sources: evidence.map((item) => item.url).sort(),
          facts: evidence.map((item) => item.content),
        }));
        const card = this.createCollectedCard({
          projectId,
          type: decision.type,
          title: decision.title,
          content: renderSynthesizedContent(decision, contentLanguage),
          imageUrl,
          sourceUrl: sourceLinks[0]?.url ?? null,
          sourceName: sourceLinks.length === 0 ? null : sourceLinks.length === 1 ? sourceLinks[0].name : `${sourceLinks.length} 个来源`,
          sourceLinks,
          sourceFingerprint: fingerprint,
          focusCategory: decision.focusCategory,
          occurredAt: decision.occurredAt,
          importance: decision.importance,
          updateBatchId: runId,
          updateBatchAt: batchAt,
          position: autoPosition(batchBaseY),
          size: informationDepthPolicy(project.informationDepth).relationHops === 0
            ? { width: 330, height: imageUrl ? 310 : 250 }
            : informationDepthPolicy(project.informationDepth).relationHops === 1 ? { width: 360, height: 380 } : { width: 420, height: 560 },
        }, decision, previousCards, contentLanguage);
        if (card) {
          newCards += 1;
          createdBatchCards.push(card);
        }
      }
      if (createdBatchCards.length > 1) {
        const anchorId = createdBatchCards[0].id;
        for (const card of createdBatchCards.slice(1)) {
          this.database.packCards({ sourceCardId: card.id, targetCardId: anchorId });
        }
      }
    const result: UpdateRunResult = {
      runId,
      projectId,
      checkedSources: sources.length,
      newCards,
      errors,
      warnings,
      finishedAt: new Date().toISOString(),
    };
    const researchSkill = this.ai && typeof this.ai.getResearchSkillInfo === "function" ? this.ai.getResearchSkillInfo() : null;
    this.database.finishTaskRun(runId, {
      ...result,
      status: errors.length === sources.length && sources.length > 0 ? "failed" : errors.length || warnings.length ? "partial" : "completed",
      warnings,
      summary: `${sources.length === 0 ? "没有可检查的信息源" : `检查 ${sources.length} 个来源，生成 ${newCards} 张当前状态卡片`}${researchSkill ? `；研究技能 ${researchSkill.name}@${researchSkill.digest}` : ""}`,
    });
    const pruned = this.database.pruneUpdateBatches(projectId, preferences.maxUpdateBatches);
    if (pruned.removedBatches > 0) {
      result.warnings.push(`已清理 ${pruned.removedBatches} 个最旧更新批次；保留 ${pruned.preservedLocked} 张重要卡片`);
    }
    return result;
    } catch (error) {
      if (runId) this.database.finishTaskRun(runId, {
        status: "failed", errors: [error instanceof Error ? error.message : "未知错误"], summary: "检查失败",
      });
      throw error;
    } finally {
      this.runningProjects.delete(projectId);
    }
  }

  private async collectSource(project: Project, source: Source): Promise<CollectedInformation[]> {
    if (source.type === "search") throw new Error("搜索型来源必须通过新媒体搜索通道检查");
    const text = await fetchText(source.url, this.fetchImpl);
    const contentHash = hashContent(text);
    let collected: CollectedInformation[] = [];

    if (source.type === "rss") {
      collected = parseFeed(text).slice(0, 12).map((item, index) => ({
        index,
        title: item.title,
        content: item.summary,
        url: item.link,
        sourceName: source.name,
        imageUrl: resolveHttpUrl(item.imageUrl, item.link),
        evidenceTier: classifyEvidenceTier(source),
        publishedAt: item.publishedAt,
        suggestedType: inferCardType(item.title),
        suggestedImportance: inferImportance(item.title),
      }));
    } else {
      const details = extractPageDetails(text, source.url, `${source.name} 网页更新`);
      collected = [{
        index: 0,
        title: details.title || `${source.name} 当前状态`,
        content: details.description,
        url: source.url,
        sourceName: source.name,
        imageUrl: details.imageUrl,
        evidenceTier: classifyEvidenceTier(source),
        publishedAt: null,
        suggestedType: "news",
        suggestedImportance: source.lastContentHash && source.lastContentHash !== contentHash ? 2 : 1,
      }];
    }

    const contentExcerpt = source.type === "web"
      ? extractCoreInformation(project, source.name, extractPageDetails(text, source.url, source.name).description)
      : null;
    this.database.updateSourceCheck(source.id, { contentHash, contentExcerpt, status: "active", error: null });
    return collected;
  }

  private async synthesize(
    project: Project,
    items: CollectedInformation[],
    warnings: string[],
    previousCards: Card[],
    language: Exclude<AppLanguage, "system">,
  ): Promise<SynthesizedInformation[]> {
    if (!items.length) return [];
    if (!this.ai?.shouldOrganizeContent()) return localSynthesis(project, items, language);
    try {
      if (typeof this.ai.synthesizeInformation === "function") {
        return await this.ai.synthesizeInformation(project, items, previousCards);
      }
      const organized = await this.ai.organizeInformation(project, items, previousCards);
      const relevant = organized.filter((decision) => decision.relevant);
      const grouped = new Map<string, Array<{ item: CollectedInformation; decision: OrganizedInformation }>>();
      for (const decision of relevant) {
        const item = items.find((candidate) => candidate.index === decision.index);
        if (!item) continue;
        const focus = focusForInformation(project, { title: decision.title, content: decision.summary });
        grouped.set(focus, [...(grouped.get(focus) ?? []), { item, decision }]);
      }
      const workflow = buildResearchWorkflow(project);
      return [...grouped].map(([focusCategory, entries]) => {
        const strongest = [...entries].sort((left, right) => right.decision.importance - left.decision.importance)[0];
        const coverage = workflow.entities.map((entity) => {
          const matching = entries.filter(({ item }) => workflow.entities.length === 1
            || item.researchEntity === entity
            || `${item.title} ${item.content}`.toLocaleLowerCase().includes(entity.toLocaleLowerCase()));
          return {
            entity,
            status: matching.length ? "confirmed" as const : "no_evidence" as const,
            statement: matching.map(({ decision }) => decision.summary).join("\n") || LOCAL_SNAPSHOT_COPY[language].noMatch,
            sourceIndexes: matching.map(({ item }) => item.index),
          };
        });
        return {
          focusCategory,
          sourceIndexes: entries.map(({ item }) => item.index),
          coverage,
          asOf: new Date().toISOString(),
          confidence: coverage.some((row) => row.status === "no_evidence") ? "low" as const : "medium" as const,
          type: strongest?.decision.type ?? "analysis",
          title: strongest?.decision.title ?? `${focusCategory}：本次更新`,
          summary: entries.map(({ decision }) => decision.summary).join("\n"),
          importance: strongest?.decision.importance ?? 2,
          occurredAt: strongest?.decision.occurredAt ?? null,
          changeKind: strongest?.decision.changeKind ?? "none",
          previousCardId: strongest?.decision.previousCardId ?? null,
          changeSummary: strongest?.decision.changeSummary ?? null,
        };
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "未知错误";
      warnings.push(`AI 综合整理失败，已保留来源提取结果并使用跨语言本地分类（${reason}）`);
      return localSynthesis(project, items, language, reason.slice(0, 180));
    }
  }

  private createCollectedCard(
    input: CreateCardInput,
    decision: OrganizedInformation | SynthesizedInformation | undefined,
    previousCards: Card[],
    language: Exclude<AppLanguage, "system">,
  ): Card | null {
    const aiPrevious = decision?.previousCardId
      ? previousCards.find((card) => card.id === decision.previousCardId) ?? null
      : null;
    const aiChange = decision?.changeKind !== "none" && aiPrevious
      ? {
          kind: decision!.changeKind as "updated" | "conflict",
          previousCardId: aiPrevious.id,
          summary: decision?.changeSummary || `${decision!.changeKind}: ${aiPrevious.title}`,
        }
      : null;
    const detected = aiChange ?? detectInformationChange(
      { title: input.title, content: input.content },
      previousCards,
      language,
    );
    const card = this.database.createCardIfNew({ ...input, changeKind: detected?.kind ?? "none" });
    if (card && detected) {
      const previous = previousCards.find((item) => item.id === detected.previousCardId) ?? null;
      this.database.addInformationChange({
        projectId: card.projectId,
        cardId: card.id,
        previousCardId: previous?.id ?? null,
        updateBatchId: card.updateBatchId,
        kind: detected.kind,
        title: card.title,
        summary: detected.summary,
        previousContent: previous?.content ?? null,
        currentContent: card.content,
        sourceUrl: card.sourceUrl,
      });
    }
    return card;
  }
}

function inferCardType(title: string): Extract<CardType, "news" | "event" | "timeline" | "analysis"> {
  if (/公演|巡演|演唱会|live|concert|tour/i.test(title)) return "event";
  return "news";
}

function inferImportance(title: string): number {
  if (/official|重要|追加|发售|售票|ticket|公演|巡演/i.test(title)) return 3;
  return 2;
}

function autoPosition(baseY = 390): { x: number; y: number } {
  return { x: 96, y: baseY };
}
