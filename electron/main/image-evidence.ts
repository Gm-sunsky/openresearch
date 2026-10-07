import type { CardImage } from "../../src/shared/contracts";

const DECORATIVE = /(?:^|[\s/_?.=-])(?:logo|icon|avatar|emoji|spacer|tracking|tracker|pixel|beacon)(?:[\s/_?.=-]|$)|favicon/i;

function cleanCaption(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
  return text ? text : null;
}

export function safeImage(candidate: string, caption: string | null = null, sourceUrl?: string): CardImage | null {
  if (!candidate.trim()) return null;
  try {
    const url = new URL(candidate.replace(/&amp;/gi, "&"), sourceUrl);
    const description = cleanCaption(caption);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || DECORATIVE.test(`${url.pathname} ${description ?? ""}`)) return null;
    return { url: url.toString(), caption: description, sourceUrl: sourceUrl ?? null, relevance: "unverified" };
  } catch {
    return null;
  }
}

export function dedupeImages(images: CardImage[]): CardImage[] {
  const unique = new Map<string, CardImage>();
  for (const image of images) {
    const safe = safeImage(image.url, image.caption, image.sourceUrl ?? undefined);
    if (!safe) continue;
    const key = new URL(safe.url); key.hash = "";
    const previous = unique.get(key.toString());
    if (!previous || (!previous.caption && safe.caption)) unique.set(key.toString(), safe);
  }
  return [...unique.values()];
}

function attribute(tag: string, name: string): string {
  return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((part) => part !== undefined)?.trim() ?? "";
}

export function imagesFromHtml(html: string, sourceUrl: string): CardImage[] {
  const images: CardImage[] = [];
  const cleaned = html.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, "");
  const addTag = (tag: string, figureCaption: string | null = null) => {
    const width = Number(attribute(tag, "width"));
    const height = Number(attribute(tag, "height"));
    if ((width > 0 && width < 120) || (height > 0 && height < 80) || DECORATIVE.test(`${attribute(tag, "class")} ${attribute(tag, "id")}`)) return;
    const candidate = attribute(tag, "data-src") || attribute(tag, "data-original") || attribute(tag, "src");
    const image = safeImage(candidate, figureCaption || attribute(tag, "alt") || null, sourceUrl);
    if (image) images.push(image);
  };
  for (const figure of cleaned.match(/<figure\b[^>]*>[\s\S]*?<\/figure>/gi) ?? []) {
    const caption = cleanCaption(figure.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1]);
    for (const tag of figure.match(/<img\b[^>]*>/gi) ?? []) addTag(tag, caption);
  }
  for (const tag of cleaned.match(/<img\b[^>]*>/gi) ?? []) addTag(tag);
  const meta = new Map<string, string>();
  for (const tag of cleaned.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    if (!meta.has(name)) meta.set(name, attribute(tag, "content"));
  }
  for (const [key, alt] of [["og:image", "og:image:alt"], ["og:image:url", "og:image:alt"], ["twitter:image", "twitter:image:alt"], ["twitter:image:src", "twitter:image:alt"]]) {
    const candidate = meta.get(key);
    if (candidate) {
      const image = safeImage(candidate, meta.get(alt) ?? null, sourceUrl);
      if (image) images.push(image);
    }
  }
  for (const tag of cleaned.match(/<link\b[^>]*>/gi) ?? []) {
    if (attribute(tag, "rel").toLowerCase() !== "image_src") continue;
    const image = safeImage(attribute(tag, "href"), null, sourceUrl);
    if (image) images.push(image);
  }
  return dedupeImages(images);
}

const GENERIC_WORDS = new Set("image photo picture photograph screenshot illustration latest official update news source article related background banner cover figure shows showing this that with from have has been were will their there about after before information announcement stock credit courtesy press release january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday today yesterday tomorrow".split(" "));
const ACTION_GROUPS = [ /发射|升空|点火|launch|liftoff/i, /着陆|回收|landing|recovery/i, /开放|开通|open/i, /封闭|关闭|closed|closure/i, /售票|开票|ticket|presale/i, /公演|演唱会|巡演|concert|tour/i, /延期|推迟|delay|postpone/i, /取消|cancel/i, /播出|放送|premiere|broadcast/i, /发布|推出|release|unveil/i ];

/** Conservative text evidence only; a source title alone is never an image caption. */
export function imageRelevanceScore(caption: string | null, coreFacts: string): number {
  if (!caption || /^(?:图片|照片|配图|封面|示意图|资料图|图\s*\d*|image|photo|picture|screenshot|illustration|stock photo)(?:\s*\d*)?$/i.test(caption.trim())) return 0;
  const lower = caption.slice(0, 4000).toLowerCase();
  const facts = coreFacts.toLowerCase();
  const words = [...new Set(lower.match(/[a-z][a-z0-9-]{2,}/g) ?? [])].filter((word) => !GENERIC_WORDS.has(word));
  const hits = words.filter((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(facts));
  let chineseLength = 0;
  for (const phrase of lower.match(/[\u4e00-\u9fff]{4,}/g) ?? []) {
    for (let length = Math.min(phrase.length, 14); length >= 4; length--) {
      if (Array.from({ length: phrase.length - length + 1 }, (_, index) => phrase.slice(index, index + length)).some((part) => facts.includes(part))) { chineseLength = Math.max(chineseLength, length); break; }
    }
  }
  const sameAction = ACTION_GROUPS.some((pattern) => pattern.test(lower) && pattern.test(facts));
  if ((hits.length >= 2 && (sameAction || hits.length >= 3)) || (chineseLength >= 4 && sameAction) || chineseLength >= 8) return hits.length * 2 + chineseLength + (sameAction ? 4 : 0);
  return 0;
}

export function selectCardImages(candidates: CardImage[], coreFacts: string): { images: CardImage[]; imageUrl: string | null } {
  const ranked = dedupeImages(candidates).map((image, index) => ({ image, index, score: imageRelevanceScore(image.caption, coreFacts) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return {
    images: ranked.map(({ image, score }) => ({ ...image, relevance: score > 0 ? "relevant" : "unverified" })),
    imageUrl: ranked.find(({ score }) => score > 0)?.image.url ?? null,
  };
}
