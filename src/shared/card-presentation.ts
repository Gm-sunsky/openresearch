import type { CardImage } from "./contracts";

/** Extract a bounded preview without modifying the full research material. */
export function summarizeCard(content: string, maxLength = 160): string {
  const budget = Math.max(0, Math.floor(maxLength));
  if (!budget) return "";
  const lines = content.split(/\r?\n/).map(line => line.replace(/^\s*(?:#{1,6}\s*|[•*-]\s*)/, "").trim())
    .filter(line => line && !/^(?:证据截止时间|可信度|Evidence cutoff|Confidence)\s*[:：]/i.test(line));
  const text = (lines.length ? lines : [content]).join(" ").replace(/\s+/g, " ").trim();
  if (text.length <= budget) return text;
  if (budget === 1) return "…";
  const excerpt = text.slice(0, budget - 1);
  const boundary = Math.max(excerpt.lastIndexOf("。"), excerpt.lastIndexOf("；"), excerpt.lastIndexOf(". "), excerpt.lastIndexOf("; "));
  return `${(boundary >= budget * .55 ? excerpt.slice(0, boundary + 1) : excerpt).trimEnd()}…`;
}

/** Treat persisted and IPC-supplied media as untrusted metadata. */
export function normalizeCardImages(value: unknown): CardImage[] {
  if (!Array.isArray(value)) return [];
  const images = new Map<string, CardImage>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    if (typeof item.url !== "string" || item.url.length > 4000) continue;
    let url: URL;
    try { url = new URL(item.url); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
    const caption = typeof item.caption === "string" ? item.caption.trim() || null : null;
    const image: CardImage = { url: url.toString(), caption, relevance: caption && item.relevance === "relevant" ? "relevant" : "unverified" };
    if (typeof item.sourceUrl === "string") {
      try { const source = new URL(item.sourceUrl); if (/^https?:$/.test(source.protocol) && !source.username && !source.password) image.sourceUrl = source.toString(); } catch { /* Invalid provenance is omitted. */ }
    }
    const previous = images.get(image.url);
    if (!previous || (image.relevance === "relevant" && previous.relevance !== "relevant") || (!previous.caption && image.caption)) images.set(image.url, image);
  }
  return [...images.values()];
}
