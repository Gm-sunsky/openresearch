import { useEffect, useRef, type KeyboardEvent } from "react";
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
  const index = cards.findIndex((item) => item.id === card.id);
  const occurredAt = card.occurredAt ? new Date(card.occurredAt) : null;
  const dateLabel = occurredAt && Number.isFinite(occurredAt.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(occurredAt) : "";
  const images: CardImage[] = [...(card.images ?? [])];
  if (card.imageUrl && !images.some((image) => image.url === card.imageUrl)) {
    images.push({ url: card.imageUrl, caption: null, relevance: "unverified" });
  }

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
      content.current?.scrollBy({ top: event.key === "ArrowUp" ? -100 : 100, behavior: "smooth" });
    }
  };

  return createPortal(
    <div className="card-reader-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} className="card-reader" role="dialog" aria-modal="true" aria-labelledby="card-reader-title" onKeyDown={keyDown}>
        <header className="card-reader-toolbar">
          <span>{zh ? "研究资料" : "Research material"}</span>
          {cards.length > 1 && <nav aria-label={zh ? "卡包资料翻页" : "Card pack pages"}>
            <button type="button" disabled={index <= 0} onClick={() => navigate(-1)} aria-label={zh ? "上一页" : "Previous page"}>‹</button>
            <span aria-live="polite">{index + 1} / {cards.length}</span>
            <button type="button" disabled={index >= cards.length - 1} onClick={() => navigate(1)} aria-label={zh ? "下一页" : "Next page"}>›</button>
          </nav>}
          <button ref={close} type="button" onClick={onClose} aria-label={zh ? "关闭资料窗口" : "Close reader"}>×</button>
        </header>
        <div ref={content} className="card-reader-scroll" tabIndex={0} aria-label={zh ? "完整资料内容" : "Full research content"}>
          <h1 id="card-reader-title">{card.title}</h1>
          <p className="card-reader-meta">{card.sourceName} {dateLabel}</p>
          <div className="card-reader-text">{card.content}</div>
          {images.length > 0 && <section aria-label={zh ? "搜集图片" : "Collected images"} className="card-reader-images">
            <h2>{zh ? "搜集图片" : "Collected images"}</h2>
            {images.map((image, imageIndex) => <figure key={`${image.url}:${imageIndex}`}>
              <img src={image.url} alt={image.caption || (zh ? "相关性尚未确认的搜集图片" : "Collected image with unverified relevance")} loading="lazy" referrerPolicy="no-referrer" />
              <figcaption>{image.caption && <p>{image.caption}</p>}{(image.relevance !== "relevant" || !image.caption?.trim()) && <span className="card-reader-unverified">{zh ? "相关性待确认，未作为核心事实配图" : "Relevance unverified; excluded from the core-fact preview"}</span>}{image.sourceUrl && <button type="button" onClick={() => void api.links.open(image.sourceUrl as string)}>{zh ? "打开图片来源" : "Open image source"}</button>}</figcaption>
            </figure>)}
          </section>}
          {card.sourceLinks.length > 0 && <section className="card-reader-sources"><h2>{zh ? "资料来源" : "Sources"}</h2>{card.sourceLinks.map((source) => <button key={source.url} type="button" onClick={() => void api.links.open(source.url)}>{source.name || source.url}</button>)}</section>}
        </div>
        <footer className="card-reader-hint">{zh ? "滚轮 / ↑ ↓ 滚动 · ← → 翻页 · Esc 关闭" : "Scroll / ↑ ↓ · ← → pages · Esc closes"}</footer>
      </div>
    </div>, document.body,
  );
}
