import { describe, expect, it } from "vitest";
import { isPrivateAddress, normalizeDiscoveredUrl } from "../electron/main/outbound-url";
import { discoverFeedLinks, parseCandidatePayload } from "../electron/main/source-discovery";

describe("source discovery input validation", () => {
  it("extracts declared RSS feeds and resolves relative links", () => {
    const result = discoverFeedLinks(
      '<html><head><link rel="alternate" type="application/rss+xml" title="News feed" href="/feed.xml"></head></html>',
      "https://example.com/news/",
    );
    expect(result).toMatchObject([{ type: "rss", name: "News feed", url: "https://example.com/feed.xml", verified: true }]);
  });

  it("parses model JSON defensively and drops unsafe candidates", () => {
    const result = parseCandidatePayload(`Here is the result:\n[{
      "type":"web","name":"Official","url":"https://example.com/news/?utm_source=ai","rationale":"Official news","confidence":0.91
    },{
      "type":"web","name":"Private","url":"http://127.0.0.1/admin","rationale":"unsafe","confidence":1
    }]`);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Official", url: "https://example.com/news", confidence: 0.91 });
  });

  it("accepts wrapped JSON, field aliases, percentages, and unrelated citation arrays", () => {
    const result = parseCandidatePayload(`Search citations: [1, 2]\n\n\`\`\`json
    {"sources":[{
      "kind":"website",
      "title":"新疆交通运输厅",
      "link":"https://jtyst.xinjiang.gov.cn/?utm_source=ai",
      "reason":"发布交通运输相关官方公告",
      "score":"92%"
    }]}
    \`\`\``);

    expect(result).toMatchObject([{
      type: "web",
      name: "新疆交通运输厅",
      url: "https://jtyst.xinjiang.gov.cn/",
      confidence: 0.92,
    }]);
  });

  it("accepts a single candidate object and derives a missing display name", () => {
    const result = parseCandidatePayload('{"url":"https://example.com/feed.xml","reason":"Official feed"}');
    expect(result).toMatchObject([{ type: "rss", name: "example.com", url: "https://example.com/feed.xml" }]);
  });

  it("classifies social, video, forum, and personal sources without forcing them into traditional web pages", () => {
    const result = parseCandidatePayload(JSON.stringify({ sources: [
      { type: "search", platform: "x", name: "X account", url: "https://x.com/example", rationale: "First-party updates", confidence: 0.8 },
      { type: "web", platform: "instagram", name: "Instagram", url: "https://instagram.com/example", rationale: "Visual updates", confidence: 0.7 },
      { type: "channel", platform: "youtube", name: "YouTube", url: "https://youtube.com/@example", rationale: "Videos", confidence: 0.8 },
      { type: "profile", platform: "bilibili", name: "Bilibili", url: "https://space.bilibili.com/123", rationale: "Videos", confidence: 0.8 },
      { type: "web", platform: "forum", name: "Forum", url: "https://community.example.com/topic/1", rationale: "Discussion", confidence: 0.6 },
      { type: "web", platform: "personal", name: "Expert blog", url: "https://expert.example.com/blog", rationale: "Expert analysis", confidence: 0.7 },
    ] }));
    expect(result.map((source) => [source.platform, source.type])).toEqual([
      ["x", "search"], ["instagram", "search"], ["youtube", "search"], ["bilibili", "search"], ["forum", "web"], ["personal", "web"],
    ]);
  });

  it("rejects prose without recoverable JSON so the agent can trigger format repair", () => {
    expect(() => parseCandidatePayload("我找到了一些来源，但没有按 JSON 输出。"))
      .toThrow(/没有可识别的 JSON 来源数据/);
  });

  it("blocks private networks and strips tracking parameters", () => {
    expect(isPrivateAddress("192.168.1.10")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(() => normalizeDiscoveredUrl("http://localhost:11434/private")).toThrow(/私有网络/);
    expect(normalizeDiscoveredUrl("https://example.com/a/?utm_campaign=test&b=2&a=1#top"))
      .toBe("https://example.com/a?a=1&b=2");
  });
});
