import { describe, expect, it } from "vitest";
import { dedupeImages, imageRelevanceScore, imagesFromHtml, safeImage, selectCardImages } from "../electron/main/image-evidence";
import { extractPageDetails, parseFeed } from "../electron/main/feed-service";

describe("image evidence collection", () => {
  it("keeps actual figure/alt captions and uncaptioned social images without inventing article captions", () => {
    const images = imagesFromHtml(`<title>Falcon launch</title><meta property="og:image" content="/social.jpg"><figure><img src="/launch.jpg" alt="Photo"><figcaption>Falcon 9 rocket launch at Cape Canaveral.</figcaption></figure><img src="/unknown.jpg"><img src="/logo.png" alt="Site logo"><img src="/tiny.gif" width="1" height="1">`, "https://example.com/article");
    expect(images).toHaveLength(3);
    expect(images.find((image) => image.url.endsWith("launch.jpg"))?.caption).toBe("Falcon 9 rocket launch at Cape Canaveral.");
    expect(images.find((image) => image.url.endsWith("social.jpg"))?.caption).toBeNull();
    expect(images.find((image) => image.url.endsWith("unknown.jpg"))?.caption).toBeNull();
  });

  it("uses social image alt but never page description or title as image evidence", () => {
    const page = extractPageDetails(`<title>Falcon 9 launch</title><meta name="description" content="Falcon 9 launches today"><meta property="og:image" content="/photo.jpg"><meta property="og:image:alt" content="Falcon 9 rocket launching">`, "https://example.com/a");
    expect(page.images?.[0].caption).toBe("Falcon 9 rocket launching");
    const withoutAlt = extractPageDetails(`<title>Falcon 9 launch</title><meta name="description" content="Falcon 9 launches today"><meta property="og:image" content="/photo.jpg">`, "https://example.com/a");
    expect(withoutAlt.images?.[0].caption).toBeNull();
  });

  it("extracts RSS media descriptions and markup captions, resolves URLs, and ignores video media", () => {
    const [item] = parseFeed(`<rss><channel><item><title>Launch update</title><link>https://example.com/update</link><media:content url="/rocket.jpg" type="image/jpeg"><media:description>Falcon 9 rocket launch at Cape Canaveral</media:description></media:content><media:content url="/video.mp4" type="video/mp4"/><description><![CDATA[<figure><img src="/other.jpg"><figcaption>Previous test flight</figcaption></figure><img src="/unknown.jpg">]]></description></item></channel></rss>`);
    expect(item.images).toHaveLength(3);
    expect(item.images?.[0]).toMatchObject({ url: "https://example.com/rocket.jpg", caption: "Falcon 9 rocket launch at Cape Canaveral", relevance: "unverified" });
    expect(item.images?.some((image) => image.url.endsWith("video.mp4"))).toBe(false);
  });

  it("rejects non-http images and trackers, deduplicates without dropping collected candidates", () => {
    for (const url of ["", "javascript:alert(1)", "data:image/png;base64,xx", "file:///tmp/photo.png", "https://example.com/pixel.gif"]) expect(safeImage(url, null, "https://example.com/article")).toBeNull();
    const first = safeImage("https://example.com/photo.jpg")!;
    const explained = safeImage("https://example.com/photo.jpg#view", "Falcon rocket launch")!;
    expect(dedupeImages([first, explained])).toHaveLength(1);
    expect(dedupeImages([first, explained])[0].caption).toBe("Falcon rocket launch");
    expect(dedupeImages(Array.from({ length: 40 }, (_, index) => safeImage(`https://example.com/${index}.jpg`)!))).toHaveLength(40);
  });
});

describe("card image relevance", () => {
  it("does not show unknown, generic or unrelated images, retaining them for full details", () => {
    const candidates = [safeImage("https://example.com/a.jpg")!, safeImage("https://example.com/b.jpg", "Photo")!, safeImage("https://example.com/c.jpg", "Osaka concert ticket announcement")!];
    const result = selectCardImages(candidates, "Falcon 9 rocket launch at Cape Canaveral on October 6.");
    expect(result.imageUrl).toBeNull();
    expect(result.images).toHaveLength(3);
    expect(result.images.every((image) => image.relevance === "unverified")).toBe(true);
  });

  it("ranks explicitly related captions first and determines relevance for each synthesized card", () => {
    const rocket = safeImage("https://example.com/rocket.jpg", "Falcon 9 rocket launch at Cape Canaveral")!;
    const concert = safeImage("https://example.com/concert.jpg", "Osaka concert tickets on sale")!;
    const result = selectCardImages([concert, rocket], "Falcon 9 rocket launch at Cape Canaveral on October 6.");
    expect(result.imageUrl).toBe(rocket.url);
    expect(result.images[0].relevance).toBe("relevant");
    expect(result.images[1].relevance).toBe("unverified");
    expect(selectCardImages([rocket, concert], "Osaka concert tickets on sale today").imageUrl).toBe(concert.url);
  });

  it("requires explicit Chinese fact overlap rather than only an entity or generic description", () => {
    expect(imageRelevanceScore("独库公路恢复开放后的车辆通行现场", "独库公路恢复开放，车辆允许通行")).toBeGreaterThan(0);
    expect(imageRelevanceScore("独库公路", "独库公路将于6月恢复开放")).toBe(0);
    expect(imageRelevanceScore("资料图", "独库公路恢复开放")).toBe(0);
    expect(imageRelevanceScore("官方最新新闻图片", "官方最新新闻更新")).toBe(0);
  });
});

it("keeps the full collected caption while limiting only the relevance computation", () => {
  const caption = "Falcon rocket launch. " + "Full image-specific explanation. ".repeat(180);
  expect(safeImage("https://example.com/rocket.jpg", caption)?.caption).toBe(caption.trim());
});

it("uses a real lazy-loaded image instead of its tracking placeholder", () => {
  const images = imagesFromHtml('<img src="/spacer.gif" data-src="/actual.jpg" alt="Falcon rocket launch confirmed">', "https://example.com/story");
  expect(images).toHaveLength(1);
  expect(images[0]).toMatchObject({ url: "https://example.com/actual.jpg", caption: "Falcon rocket launch confirmed" });
});
