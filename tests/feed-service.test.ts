import { describe, expect, it } from "vitest";
import { extractCoreInformation, extractPageDetails, parseFeed, stripMarkup } from "../electron/main/feed-service";
import type { Project } from "../src/shared/contracts";

describe("feed parsing", () => {
  it("parses RSS items and removes markup from summaries", () => {
    const items = parseFeed(`<?xml version="1.0"?><rss><channel><item><title>New Tour</title><link>https://example.com/tour</link><description><![CDATA[<p>Tokyo &amp; Osaka</p>]]></description><pubDate>Sat, 08 Aug 2026 09:00:00 GMT</pubDate></item></channel></rss>`);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "New Tour", link: "https://example.com/tour", summary: "Tokyo & Osaka" });
  });

  it("parses Atom alternate links", () => {
    const items = parseFeed(`<feed><entry><title>Announcement</title><link rel="alternate" href="https://example.com/a"/><summary>Details</summary><updated>2026-08-08</updated></entry></feed>`);
    expect(items[0]?.link).toBe("https://example.com/a");
  });

  it("extracts a feed image and resolves key page metadata", () => {
    const [item] = parseFeed(`<rss><channel><item><title>Road</title><link>https://example.com/road</link><description>Status</description><media:content url="https://cdn.example.com/road.jpg" type="image/jpeg"/></item></channel></rss>`);
    expect(item?.imageUrl).toBe("https://cdn.example.com/road.jpg");

    const page = extractPageDetails(`<html><head><title>独库公路通行公告</title><meta property="og:image" content="/images/road.jpg"><meta name="description" content="开放时间已确认"></head><body><p>独库公路将于 6 月 15 日恢复开放。</p></body></html>`, "https://example.com/status");
    expect(page).toMatchObject({ title: "独库公路通行公告", imageUrl: "https://example.com/images/road.jpg" });
    expect(page.description).toContain("6 月 15 日恢复开放");
  });

  it("selects project-related facts instead of page boilerplate", () => {
    const project: Project = {
      id: "road", name: "独库公路开放追踪", description: "道路状态", goal: "追踪独库公路开放和封闭情况",
      focus: ["开放时间", "交通管制"], updateFrequency: "daily", status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01", cardCount: 0, sourceCount: 1,
    };
    const summary = extractCoreInformation(project, "道路公告", "首页。用户登录。独库公路将于 2026 年 6 月 15 日恢复开放。每日 8 时至 20 时允许七座以下车辆通行。本站还有文艺演出资讯。");
    expect(summary).toContain("6 月 15 日恢复开放");
    expect(summary).toContain("8 时至 20 时");
    expect(summary).not.toContain("用户登录");
  });

  it("strips scripts and normalizes whitespace", () => {
    expect(stripMarkup("<script>bad()</script><p>Hello&nbsp; world</p>")).toBe("Hello world");
  });
});


describe("evidence preservation", () => {
  it("retains full RSS/Atom content rather than a short description", () => {
    const text = "Background sentence. ".repeat(70) + "The event starts on October 4.";
    const rss = parseFeed('<rss><channel><item><title>Event</title><link>https://example.com/event</link><description>Short teaser</description><content:encoded><![CDATA[' + text + ']]></content:encoded></item></channel></rss>');
    const atom = parseFeed('<feed><entry><title>Event</title><link href="https://example.com/event"/><summary>Short teaser</summary><content>' + text + '</content></entry></feed>');
    expect(rss[0].summary).toContain("October 4");
    expect(atom[0].summary).toContain("October 4");
    expect(rss[0].summary.length).toBeLessThanOrEqual(12_000);
  });
});
