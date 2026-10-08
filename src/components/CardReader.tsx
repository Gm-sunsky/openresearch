import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import type { Card, CardImage } from "../shared/contracts";
import { useI18n } from "../i18n";
import "./card-reader.css";

interface CardReaderProps {
  card: Card;
  cards: Card[];
  onNavigate(cardId: string): void;
  onClose(): void;
}

export function CardReader({ card, cards, onNavigate, onClose }: CardReaderProps) {
  const { locale } = useI18n();
  const zh = locale.startsWith("zh");
  const dialog = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const overview = useRef<HTMLElement>(null);
  const facts = useRef<HTMLElement>(null);
  const sources = useRef<HTMLElement>(null);
  const gallery = useRef<HTMLElement>(null);
  const coreImageSection = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState("overview");
  const index = cards.findIndex((item) => item.id === card.id);
  const occurredAt = card.occurredAt ? new Date(card.occurredAt) : null;
  const dateLabel = occurredAt && Number.isFinite(occurredAt.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(occurredAt) : "";
  const images: CardImage[] = [...(card.images ?? [])];
  if (card.imageUrl && !images.some((image) => image.url === card.imageUrl)) {
    images.push({ url: card.imageUrl, caption: null, relevance: "unverified" });
  }
  const coreImage = images.find((image) => image.relevance === "relevant" && image.caption?.trim());
  const sourceLinks = card.sourceLinks.length ? card.sourceLinks : card.sourceUrl ? [{ name: card.sourceName || card.sourceUrl, url: card.sourceUrl }] : [];
  const sourceName = card.sourceName?.trim();
  const sourceNameIsCount = !!sourceName && /^\d+\s*(?:个来源|sources?)$/i.test(sourceName);
  const jumpTo = (section: HTMLElement | null, sectionName: string) => {
    setActiveSection(sectionName);
    if (sectionName === "images") {
      gallery.current?.focus({ preventScroll: true });
    } else {
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
      content.current?.focus({ preventScroll: true });
    }
  };
  const imageFigure = (image: CardImage, imageIndex: number) => <figure key={`${image.url}:${imageIndex}`}>
    <img src={image.url} alt={image.caption || (zh ? "相关性尚未确认的搜集图片" : "Collected image with unverified relevance")} loading="lazy" referrerPolicy="no-referrer" />
    <figcaption>{image.caption && <p>{image.caption}</p>}{(image.relevance !== "relevant" || !image.caption?.trim()) && <span className="card-reader-unverified">{zh ? "相关性待确认，未作为核心事实配图" : "Relevance unverified; excluded from the core-fact preview"}</span>}{image.sourceUrl && <button type="button" onClick={() => void api.links.open(image.sourceUrl as string)}>{zh ? "打开图片来源" : "Open image source"}</button>}</figcaption>
  </figure>;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && !node.contains(dialog.current));
    const states = background.map((node) => ({ node, inert: node.inert }));
    states.forEach(({ node }) => { node.inert = true; });
    close.current?.focus();
    return () => {
      states.forEach(({ node, inert }) => { node.inert = inert; });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    setActiveSection("overview");
    if (gallery.current) gallery.current.scrollTop = 0;
    if (content.current) {
      content.current.scrollTop = 0;
      content.current.focus({ preventScroll: true });
    }
  }, [card.id]);

  const navigate = (delta: number) => {
    const next = cards[index + delta];
    if (next) onNavigate(next.id);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Tab") {
      const targets = Array.from(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex='0']") ?? []);
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigate(event.key === "ArrowLeft" ? -1 : 1); }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const scroller = gallery.current?.contains(event.target as Node) ? gallery.current : content.current;
      scroller?.scrollBy({ top: event.key === "ArrowUp" ? -100 : 100, behavior: "smooth" });
    }
  };

  return createPortal(
    <div className="card-reader-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} className="card-reader" role="dialog" aria-modal="true" aria-labelledby="card-reader-title" onKeyDown={keyDown}>
        <header className="card-reader-toolbar">
          <span className="card-reader-brand"><span className="card-reader-brand-mark" />{zh ? "完整资料" : "Research material"}<small>{zh ? "专注阅读" : "Focused reading"}</small></span>
          {cards.length > 1 && <nav aria-label={zh ? "卡包资料翻页" : "Card pack pages"}>
            <button type="button" disabled={index <= 0} onClick={() => navigate(-1)} aria-label={zh ? "上一页" : "Previous page"}>‹</button>
            <span aria-live="polite">{index + 1} / {cards.length}</span>
            <button type="button" disabled={index >= cards.length - 1} onClick={() => navigate(1)} aria-label={zh ? "下一页" : "Next page"}>›</button>
          </nav>}
          <button ref={close} type="button" onClick={onClose} aria-label={zh ? "关闭资料窗口" : "Close reader"}>×</button>
        </header>
        <div className="card-reader-layout">
        <aside className="card-reader-contents" aria-label={zh ? "目录" : "Contents"}>
          <h2>{zh ? "目录" : "Contents"}</h2>
          <button type="button" aria-current={activeSection === "overview" ? "location" : undefined} className={activeSection === "overview" ? "card-reader-section-active" : undefined} onClick={() => jumpTo(overview.current, "overview")}>{zh ? "概述" : "Overview"}</button>
          <button type="button" aria-current={activeSection === "facts" ? "location" : undefined} className={activeSection === "facts" ? "card-reader-section-active" : undefined} onClick={() => jumpTo(facts.current, "facts")}>{zh ? "完整内容" : "Full content"}</button>
          <button type="button" aria-current={activeSection === "sources" ? "location" : undefined} className={activeSection === "sources" ? "card-reader-section-active" : undefined} onClick={() => jumpTo(sources.current, "sources")}>{zh ? "来源材料" : "Sources"}<span>{sourceLinks.length}</span></button>
          <button type="button" aria-current={activeSection === "images" ? "location" : undefined} className={activeSection === "images" ? "card-reader-section-active" : undefined} onClick={() => jumpTo(gallery.current, "images")}>{zh ? "图片" : "Images"}<span>{images.length}</span></button>
          <p>{zh ? "保留完整信息\n回到来源核对事实" : "Complete information.\nTrace facts to their sources."}</p>
        </aside>
        <div ref={content} className="card-reader-scroll" tabIndex={0} aria-label={zh ? "完整资料内容" : "Full research content"}>
          <section ref={overview} className="card-reader-overview">
          <h1 id="card-reader-title">{card.title}</h1>
          <p className="card-reader-meta">{sourceName && !sourceNameIsCount && <span>▤ {sourceName}</span>}<span>{sourceLinks.length} {zh ? "个来源" : "sources"}</span>{dateLabel && <span>{dateLabel}</span>}</p>
          {card.summary && <p className="card-reader-summary">{card.summary}</p>}
          </section>
          <section ref={facts}><div className="card-reader-text">{card.content}</div></section>
          {coreImage && <section ref={coreImageSection} className="card-reader-core-image">{imageFigure(coreImage, images.indexOf(coreImage))}</section>}
          <section ref={sources} className="card-reader-sources"><h2>{zh ? "资料来源" : "Sources"}</h2>{sourceLinks.length ? sourceLinks.map((source) => <button key={source.url} type="button" onClick={() => void api.links.open(source.url)}><span>▤</span><span>{source.name || source.url}<small>{source.url}</small></span><span>↗</span></button>) : <p>{zh ? "这份资料尚未附带来源链接。" : "No source links are attached to this material."}</p>}</section>
        </div>
        <aside ref={gallery} tabIndex={0} aria-label={zh ? "搜集图片" : "Collected images"} className="card-reader-images">
          <h2>{zh ? "相关图片" : "Collected images"}<span>{images.length}</span></h2>
          {coreImage && <button type="button" className="card-reader-core-link" onClick={() => jumpTo(coreImageSection.current, "facts")}>{zh ? "核心事实配图见正文" : "Core-fact image in the article"} ↗</button>}
          {images.filter((image) => image !== coreImage).map(imageFigure)}
          {!images.length && <p className="card-reader-image-empty">{zh ? "这份资料没有搜集图片。" : "No images were collected for this material."}</p>}
        </aside>
        </div>
        <footer className="card-reader-hint">{zh ? "滚轮 / ↑ ↓ 滚动 · ← → 翻页 · Esc 关闭" : "Scroll / ↑ ↓ · ← → pages · Esc closes"}</footer>
      </div>
    </div>, document.body,
  );
}
