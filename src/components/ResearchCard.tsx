import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { api } from "../api";
import { formatRelativeTime } from "../lib/format";
import { cardContentLayout, resizeCardFrame, type ResizeEdge } from "../lib/card-resize";
import type { Card } from "../shared/contracts";
import { AlertIcon, ExternalIcon, LockIcon, MoreIcon, SparkIcon, TrashIcon } from "./Icons";
import { useI18n } from "../i18n";

interface ResearchCardProps {
  card: Card;
  cardsInPack: Card[];
  activeIndex: number;
  selected: boolean;
  highlighted: boolean;
  dropTarget: boolean;
  onDragMove(cardId: string, position: { x: number; y: number }): void;
  onDragEnd(cardId: string, position: { x: number; y: number }): void;
  onResize(cardId: string, position: { x: number; y: number }, size: { width: number; height: number }): void;
  onSelect(cardId: string): void;
  onNavigate(index: number): void;
  onUnpack(cardId: string): void;
  onUnpackAll(packId: string): void;
  onDelete(cardId: string): void;
  onSetLocked(cardId: string, locked: boolean): void;
}

interface ResizeState {
  pointerId: number;
  edge: ResizeEdge;
  startX: number;
  startY: number;
  originPosition: { x: number; y: number };
  originSize: { width: number; height: number };
  latestPosition: { x: number; y: number };
  latestSize: { width: number; height: number };
}

interface DragState {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  latestPosition: { x: number; y: number };
  mode: "pending" | "drag" | "swipe";
  longPressed: boolean;
}

const resizeEdges: ResizeEdge[] = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];

export function ResearchCard({
  card,
  cardsInPack,
  activeIndex,
  selected,
  highlighted,
  dropTarget,
  onDragMove,
  onDragEnd,
  onResize,
  onSelect,
  onNavigate,
  onUnpack,
  onUnpackAll,
  onDelete,
  onSetLocked,
}: ResearchCardProps) {
  const { t, locale } = useI18n();
  const [position, setPosition] = useState(card.position);
  const [size, setSize] = useState(card.size);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [imageState, setImageState] = useState<{
    key: string;
    size: { width: number; height: number } | null;
    failed: boolean;
  } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageKey = `${card.id}:${card.imageUrl ?? ""}`;
  const currentImage = imageState?.key === imageKey ? imageState : null;
  const drag = useRef<DragState | null>(null);
  const resize = useRef<ResizeState | null>(null);
  const resizeCleanup = useRef<(() => void) | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const lastWheelAt = useRef(0);
  const packed = cardsInPack.length > 1 && Boolean(card.packId);
  const sourceLinks = card.sourceLinks.length
    ? card.sourceLinks
    : card.sourceUrl ? [{ name: card.sourceName || card.sourceUrl, url: card.sourceUrl }] : [];

  useEffect(() => setPosition(card.position), [card.position]);
  useEffect(() => setSize(card.size), [card.size]);
  useEffect(() => setMenuOpen(false), [card.id]);
  useEffect(() => () => resizeCleanup.current?.(), []);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const pointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || resizing || (event.target as HTMLElement).closest("button, a, [role='menu'], [data-resize-handle]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      latestPosition: position,
      mode: "pending",
      longPressed: false,
    };
    if (packed) {
      longPressTimer.current = window.setTimeout(() => {
        if (!drag.current || drag.current.mode !== "pending") return;
        drag.current.longPressed = true;
        onUnpack(card.id);
      }, 650);
    }
  };

  const pointerMove = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (state.mode === "pending" && Math.hypot(deltaX, deltaY) > 7) {
      clearLongPress();
      state.mode = state.pointerType === "touch" && packed && Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? "swipe" : "drag";
      if (state.mode === "drag") setDragging(true);
    }
    if (state.mode !== "drag") return;
    const next = {
      x: Math.max(24, state.originX + deltaX),
      y: Math.max(24, state.originY + deltaY),
    };
    state.latestPosition = next;
    setPosition(next);
    onDragMove(card.id, next);
  };

  const finishPointer = (event: PointerEvent<HTMLElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    clearLongPress();
    drag.current = null;
    setDragging(false);
    if (state.longPressed) return;
    if (state.mode === "drag") {
      onDragEnd(card.id, state.latestPosition);
      return;
    }
    if (state.mode === "swipe") {
      const deltaX = event.clientX - state.startX;
      if (Math.abs(deltaX) >= 38) onNavigate(activeIndex + (deltaX < 0 ? 1 : -1));
      return;
    }
    onSelect(card.id);
  };

  const cancelPointer = (event: PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    clearLongPress();
    const wasDragging = drag.current.mode === "drag";
    drag.current = null;
    setDragging(false);
    setPosition(card.position);
    if (wasDragging) onDragEnd(card.id, card.position);
  };

  const switchWithWheel = (event: WheelEvent<HTMLElement>) => {
    if (!packed || resizing || Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY)) < 4) return;
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelAt.current < 180) return;
    lastWheelAt.current = now;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    onNavigate(activeIndex + (delta > 0 ? 1 : -1));
  };

  const openSource = (url: string) => void api.links.open(url);

  const action = (callback: () => void) => {
    setMenuOpen(false);
    callback();
  };

  const applyResize = (pointerId: number, clientX: number, clientY: number) => {
    const state = resize.current;
    if (!state || state.pointerId !== pointerId) return;
    const next = resizeCardFrame(
      state.originPosition,
      state.originSize,
      state.edge,
      { x: clientX - state.startX, y: clientY - state.startY },
    );
    state.latestPosition = next.position;
    state.latestSize = next.size;
    setPosition(next.position);
    setSize(next.size);
  };

  const completeResize = (pointerId: number, cancelled: boolean) => {
    const state = resize.current;
    if (!state || state.pointerId !== pointerId) return;
    resize.current = null;
    resizeCleanup.current?.();
    resizeCleanup.current = null;
    setResizing(false);
    if (cancelled) {
      setPosition(card.position);
      setSize(card.size);
    } else {
      onResize(card.id, state.latestPosition, state.latestSize);
    }
  };

  const beginResize = (event: PointerEvent<HTMLDivElement>, edge: ResizeEdge) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    clearLongPress();
    resize.current = {
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      originPosition: position,
      originSize: size,
      latestPosition: position,
      latestSize: size,
    };
    const move = (nextEvent: globalThis.PointerEvent) => {
      if (nextEvent.pointerId !== event.pointerId) return;
      nextEvent.preventDefault();
      applyResize(nextEvent.pointerId, nextEvent.clientX, nextEvent.clientY);
    };
    const finish = (nextEvent: globalThis.PointerEvent) => completeResize(nextEvent.pointerId, false);
    const cancel = (nextEvent: globalThis.PointerEvent) => completeResize(nextEvent.pointerId, true);
    const cleanup = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
    };
    resizeCleanup.current?.();
    resizeCleanup.current = cleanup;
    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", cancel, true);
    setMenuOpen(false);
    setResizing(true);
  };

  const layout = cardContentLayout(size, Boolean(card.imageUrl) && !currentImage?.failed, currentImage?.size);

  return (
    <div
      className={`card-pack-shell ${dragging ? "dragging" : ""} ${resizing ? "resizing" : ""} ${dropTarget ? "drop-target" : ""}`}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${dropTarget ? 1.045 : 1})`,
        width: size.width,
        height: size.height,
      }}
    >
      {packed && <><span className="pack-sheet pack-sheet-back" /><span className="pack-sheet pack-sheet-mid" /></>}
      <article
        className={`research-card type-${card.type} change-${card.changeKind} ${dragging ? "dragging" : ""} ${resizing ? "resizing" : ""} ${selected ? "selected" : ""} ${highlighted ? "jump-target" : ""} ${packed ? "packed" : ""} ${layout.compact ? "compact" : ""} ${layout.showImage ? "has-image" : ""}`}
        data-card-id={card.id}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={cancelPointer}
        onWheel={switchWithWheel}
        title={packed ? "滚轮或横滑切换卡片；长按拆出当前卡片" : undefined}
      >
        <div className="card-grip" aria-hidden="true" />
        <header className="relative z-[2] flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="card-kind">
              {card.type === "analysis" && <SparkIcon className="h-3 w-3" />}
              {card.type === "news" ? t("latestUpdate") : card.type === "source" ? t("informationSource") : card.type === "event" ? t("event") : card.type === "timeline" ? t("timeline") : card.type === "analysis" ? t("aiAnalysis") : t("note")}
            </span>
            {card.focusCategory && <span className="card-focus-category" title={card.focusCategory}>{card.focusCategory}</span>}
          </div>
          <div className="flex items-center gap-1">
            {card.changeKind !== "none" && <span className={`change-badge ${card.changeKind}`} title={card.changeKind === "conflict" ? t("conflict") : t("changed")}><AlertIcon className="h-3 w-3" /></span>}
            {card.locked && <span className="card-lock" title={t("savedImportant")}><LockIcon className="h-3 w-3" /></span>}
            {packed && (
              <div className="pack-navigation" aria-label={`卡包，共 ${cardsInPack.length} 张卡片`}>
                <button type="button" aria-label="上一张卡片" onClick={() => onNavigate(activeIndex - 1)}>‹</button>
                <span>{activeIndex + 1}/{cardsInPack.length}</span>
                <button type="button" aria-label="下一张卡片" onClick={() => onNavigate(activeIndex + 1)}>›</button>
              </div>
            )}
            <div className="relative">
              <button className="card-menu" type="button" aria-label="卡片菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><MoreIcon className="h-4 w-4" /></button>
              {menuOpen && (
                <div className="card-action-menu" role="menu">
                  <button type="button" role="menuitem" onClick={() => action(() => onSelect(card.id))}>{t("editContent")}</button>
                  <button type="button" role="menuitem" onClick={() => action(() => onSetLocked(card.id, !card.locked))}><LockIcon className="h-3 w-3" />{card.locked ? t("unlockImportant") : t("lockImportant")}</button>
                  <button className="danger" type="button" role="menuitem" onClick={() => action(() => onDelete(card.id))}><TrashIcon className="h-3 w-3" />{t("deleteCard")}</button>
                  {packed && <div className="menu-divider" />}
                  {packed && <button type="button" role="menuitem" onClick={() => action(() => onUnpack(card.id))}>{t("unpackCurrent")}</button>}
                  {packed && card.packId && <button type="button" role="menuitem" onClick={() => action(() => onUnpackAll(card.packId as string))}>{t("unpackAll")}</button>}
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="card-switch-content" key={card.id}>
          <h2 className="card-title mt-5 text-[17px] font-semibold leading-[1.25] tracking-[-0.025em] theme-text-primary">{card.title}</h2>
          {layout.showImage && (
            <div className="card-image-frame" style={{ height: layout.imageHeight }}>
              <img
                key={imageKey}
                ref={imageRef}
                src={card.imageUrl as string}
                alt={`${card.title} 的关键图片`}
                loading="lazy"
                draggable={false}
                referrerPolicy="no-referrer"
                onLoad={(event) => {
                  if (event.currentTarget !== imageRef.current) return;
                  const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                  setImageState({ key: imageKey, size: { width, height }, failed: false });
                }}
                onError={(event) => {
                  if (event.currentTarget !== imageRef.current) return;
                  setImageState({ key: imageKey, size: null, failed: true });
                }}
              />
            </div>
          )}
          {!layout.compact && card.sourceUrl && <span className="card-summary-label">{t("coreInfo")}</span>}
          {layout.contentLines > 0 && <p className="card-content whitespace-pre-line text-[12px] leading-[1.7] theme-text-secondary" style={{ WebkitLineClamp: layout.contentLines }}>{card.content}</p>}
          <footer className="mt-auto flex items-end justify-between gap-3 pt-5">
            <div className="min-w-0">
              {card.sourceName && <p className="truncate text-[10px] font-medium theme-text-secondary">{card.sourceName}</p>}
              <p className="mt-0.5 text-[9px] theme-text-muted">{card.updateBatchAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(card.updateBatchAt)) : formatRelativeTime(card.occurredAt ?? card.createdAt, locale)}</p>
            </div>
            {sourceLinks.length > 0 && (
              <div className="source-cluster">
                <button
                  className="source-link"
                  type="button"
                  onClick={() => sourceLinks.length === 1 && openSource(sourceLinks[0].url)}
                  aria-label={sourceLinks.length === 1 ? t("openSource") : `${sourceLinks.length} ${t("combinedSources")}`}
                  aria-haspopup={sourceLinks.length > 1 ? "menu" : undefined}
                >
                  <ExternalIcon className="h-3.5 w-3.5" />
                  {sourceLinks.length > 1 && <span>{sourceLinks.length}</span>}
                </button>
                {sourceLinks.length > 1 && (
                  <div className="source-popover" role="menu">
                    <header><strong>{t("combinedSources")}</strong><small>{sourceLinks.length}</small></header>
                    {sourceLinks.map((source) => (
                      <button key={source.url} type="button" role="menuitem" onClick={() => openSource(source.url)}>
                        <span>{source.name}</span>
                        <small>{source.url.replace(/^https?:\/\//, "").split("/")[0]}</small>
                        <ExternalIcon className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </footer>
        </div>
      </article>
      {resizeEdges.map((edge) => (
        <div
          key={edge}
          className={`card-resize-handle resize-${edge}`}
          data-resize-handle={edge}
          aria-label={`调整卡片${edge}边缘`}
          onPointerDown={(event) => beginResize(event, edge)}
        />
      ))}
      {resizing && <div className="card-size-readout">{Math.round(size.width)} × {Math.round(size.height)}</div>}
    </div>
  );
}
