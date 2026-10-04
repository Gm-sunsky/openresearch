import type { SourcePlatform, SourceType } from "./contracts";

const PLATFORMS = new Set<SourcePlatform>(["rss", "website", "x", "instagram", "youtube", "bilibili", "forum", "personal"]);

export function inferSourcePlatform(rawUrl: string, type: SourceType = "web"): SourcePlatform {
  if (type === "rss") return "rss";
  let host = "";
  let path = "";
  try {
    const url = new URL(rawUrl);
    host = url.hostname.toLowerCase().replace(/^www\./, "");
    path = url.pathname.toLowerCase();
  } catch {
    return "website";
  }
  if (host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
  if (host === "bilibili.com" || host.endsWith(".bilibili.com") || host === "b23.tv") return "bilibili";
  if (/reddit\.com$|zhihu\.com$|tieba\.baidu\.com$|nga\.cn$|v2ex\.com$|douban\.com$|quora\.com$/.test(host)
    || /(^|[.-])(forum|bbs|community)([.-]|$)/.test(host)
    || /\/(forum|forums|bbs|community|thread|topic)\b/.test(path)) return "forum";
  return "website";
}

export function normalizeSourcePlatform(value: unknown, url: string, type: SourceType): SourcePlatform {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  const aliases: Record<string, SourcePlatform> = {
    twitter: "x", "x/twitter": "x", instagram: "instagram", ins: "instagram",
    youtube: "youtube", yt: "youtube", bilibili: "bilibili", "b站": "bilibili",
    forum: "forum", bbs: "forum", community: "forum", blog: "personal", personal: "personal",
    website: "website", web: "website", rss: "rss", feed: "rss",
  };
  const candidate = aliases[normalized] ?? normalized as SourcePlatform;
  return PLATFORMS.has(candidate) ? candidate : inferSourcePlatform(url, type);
}

export function recommendedSourceType(platform: SourcePlatform, url: string, declared?: SourceType): SourceType {
  if (declared === "rss" || platform === "rss" || /(?:rss|atom|feed)(?:\.|\/|$)/i.test(url)) return "rss";
  if (["x", "instagram", "youtube", "bilibili"].includes(platform)) return "search";
  return declared === "search" ? "search" : "web";
}

export function sourcePlatformLabel(platform: SourcePlatform): string {
  return ({ rss: "RSS", website: "Web", x: "X", instagram: "Instagram", youtube: "YouTube", bilibili: "Bilibili", forum: "Forum", personal: "Personal" })[platform];
}
