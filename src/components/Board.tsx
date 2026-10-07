import { useEffect, useMemo, useRef, useState } from "react";
import type { Card } from "../shared/contracts";
import { filterCards, type CardFilter } from "../lib/card-filter";
import { findPackingTarget, groupCardBundles } from "../lib/card-packs";
import { PlusIcon } from "./Icons";
import { ResearchCard } from "./ResearchCard";
import { useI18n } from "../i18n";
import { activeUpdateBatch, buildUpdateBatchRegions } from "../lib/update-batches";
import { cardNavigationTarget } from "../lib/card-navigation";
import { Timeline } from "./Timeline";

export interface CardFocusRequest {
  cardId: string;
  requestId: number;
}

interface BoardProps {
  cards: Card[];
  loading: boolean;
  onMove(cardId: string, position: { x: number; y: number }): void;
  onResize(cardId: string, position: { x: number; y: number }, size: { width: number; height: number }): void;
  onAddNote(): void;
  selectedCardId: string | null;
  onSelect(cardId: string | null): void;
  onOpen?(cardId: string): void;
  onPack(sourceCardId: string, targetCardId: string): void;
  onUnpack(cardId: string): void;
  onUnpackAll(packId: string): void;
  onDelete(cardId: string): void;
  onSetLocked(cardId: string, locked: boolean): void;
  focusRequest: CardFocusRequest | null;
}

const filters = [
  { value: "all", label: "all" }, { value: "news", label: "news" }, { value: "event", label: "event" },
  { value: "analysis", label: "analysis" }, { value: "timeline", label: "timeline" }, { value: "source", label: "source" }, { value: "note", label: "note" },
] as const satisfies ReadonlyArray<{ value: CardFilter; label: "all" | "news" | "event" | "analysis" | "timeline" | "source" | "note" }>;

export function Board({ cards, loading, onMove, onResize, onAddNote, selectedCardId, onSelect, onOpen, onPack, onUnpack, onUnpackAll, onDelete, onSetLocked, focusRequest }: BoardProps) {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<CardFilter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"board" | "timeline">("board");
  const [timelineFocus, setTimelineFocus] = useState<CardFocusRequest | null>(null);
  const [packIndexes, setPackIndexes] = useState<Record<string, number>>({});
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);
  const previousNewestBatch = useRef<string | null>(null);
  const handledFocusRequest = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const timelineRequestId = useRef(0);
  const matchedIds = useMemo(() => new Set(filterCards(cards, filter, query).map((card) => card.id)), [cards, filter, query]);
  const visibleBundles = useMemo(() => groupCardBundles(cards).filter((bundle) => bundle.cards.some((card) => matchedIds.has(card.id))), [cards, matchedIds]);
  const displayedCards = visibleBundles.map((bundle) => {
    const savedIndex = Math.max(0, Math.min(bundle.cards.length - 1, packIndexes[bundle.id] ?? 0));
    const matchingIndex = bundle.cards.findIndex((card) => matchedIds.has(card.id));
    return bundle.cards[matchingIndex >= 0 && !matchedIds.has(bundle.cards[savedIndex]?.id) ? matchingIndex : savedIndex];
  });
  const batchMarkers = useMemo(() => buildUpdateBatchRegions(cards), [cards]);
  const nodeBatches = useMemo(() => [...batchMarkers].sort((left, right) => right.at.localeCompare(left.at)), [batchMarkers]);
  const canvasHeight = Math.max(900, ...cards.map((card) => card.position.y + card.size.height + 64));

  useEffect(() => {
    const newest = nodeBatches[0]?.id ?? null;
    if (view === "board" && previousNewestBatch.current && newest && previousNewestBatch.current !== newest) {
      const target = batchMarkers.find((batch) => batch.id === newest);
      window.requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: Math.max(0, (target?.y ?? 0) - 82), behavior: "smooth" }));
    }
    previousNewestBatch.current = newest;
    setActiveBatchId((current) => current && batchMarkers.some((batch) => batch.id === current) ? current : batchMarkers[0]?.id ?? null);
  }, [batchMarkers, nodeBatches, view]);

  useEffect(() => {
    const request = timelineFocus ?? focusRequest;
    if (!request || handledFocusRequest.current === request.requestId) return;
    handledFocusRequest.current = request.requestId;
    const target = cardNavigationTarget(cards, request.cardId);
    if (!target) return;
    setView("board");
    setFilter("all");
    setQuery("");
    setPackIndexes((current) => ({ ...current, [target.bundleId]: target.packIndex }));
    setActiveBatchId(target.card.updateBatchId);
    onSelect(target.card.id);
    setHighlightedCardId(null);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const viewport = scrollRef.current;
        if (!viewport) return;
        viewport.scrollTo({
          top: Math.max(0, target.card.position.y - (viewport.clientHeight - target.card.size.height) / 2),
          left: Math.max(0, target.card.position.x - (viewport.clientWidth - target.card.size.width) / 2),
          behavior: "smooth",
        });
        setHighlightedCardId(target.card.id);
        highlightTimer.current = window.setTimeout(() => setHighlightedCardId(null), 1_500);
      });
    });
  }, [cards, focusRequest, timelineFocus, onSelect]);

  useEffect(() => { setTimelineFocus(null); }, [focusRequest]);

  useEffect(() => () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
  }, []);

  const jumpToBatch = (batchId: string) => {
    const target = batchMarkers.find((batch) => batch.id === batchId);
    if (!target) return;
    setActiveBatchId(batchId);
    scrollRef.current?.scrollTo({ top: Math.max(0, target.y - 82), behavior: "smooth" });
  };

  const movePackIndex = (bundleId: string, nextIndex: number, bundleCards: Card[]) => {
    const normalizedIndex = (nextIndex + bundleCards.length) % bundleCards.length;
    setPackIndexes((current) => ({ ...current, [bundleId]: normalizedIndex }));
    onSelect(bundleCards[normalizedIndex]?.id ?? null);
  };

  const dragMove = (cardId: string, position: { x: number; y: number }) => {
    setDropTargetId(findPackingTarget(displayedCards, cardId, position));
  };

  const dragEnd = (cardId: string, position: { x: number; y: number }) => {
    const targetId = findPackingTarget(displayedCards, cardId, position);
    setDropTargetId(null);
    if (targetId) onPack(cardId, targetId);
    else onMove(cardId, position);
  };
  return (
    <section ref={scrollRef} className="board-scroll relative flex-1 overflow-auto" aria-label="项目信息白板" onScroll={(event) => setActiveBatchId(activeUpdateBatch(batchMarkers, event.currentTarget.scrollTop + 110))} onMouseDown={(event) => event.target === event.currentTarget && onSelect(null)}>
      <div className="board-tools sticky top-4 z-30 ml-[90px] flex w-max items-center gap-2">
        <div className="board-filter flex items-center gap-0.5">
          <button type="button" className={view === "board" ? "selected" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>{t("boardView")}</button>
          <button type="button" className={view === "timeline" ? "selected" : ""} aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>{t("timelineView")}</button>
        </div>
        <div className="board-filter flex items-center gap-0.5">
          {filters.map((item) => <button className={filter === item.value ? "selected" : ""} type="button" key={item.value} onClick={() => setFilter(item.value)}>{t(item.label)}</button>)}
        </div>
        <input className="board-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchCards")} aria-label={t("searchCards")} />
      </div>
      {view === "timeline" ? (loading ? <div className="timeline-view"><div className="loading-mark" /></div> : <Timeline cards={cards.filter((card) => matchedIds.has(card.id))} onOpen={(cardId) => setTimelineFocus({ cardId, requestId: --timelineRequestId.current })} />) : <>
      {nodeBatches.length > 0 && (
        <div className="update-node-sticky" aria-hidden={false}>
          <nav className="update-node-rail" aria-label={t("updateNavigator")}>
            <span className="update-node-line" aria-hidden="true" />
            {nodeBatches.map((batch, index) => {
              const date = new Date(batch.at);
              return (
                <button
                  key={batch.id}
                  type="button"
                  className={`update-node ${activeBatchId === batch.id ? "active" : ""}`}
                  onClick={() => jumpToBatch(batch.id)}
                  title={`${t("jumpToUpdate")} · ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)}`}
                >
                  <span className="update-node-dot" />
                  <span className="update-node-copy">
                    <strong>{index === 0 ? t("latestBatch") : new Intl.DateTimeFormat(locale, { month: "2-digit", day: "2-digit" }).format(date)}</strong>
                    <small>{new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date)}</small>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
      <div className="board-canvas relative min-w-[1100px]" style={{ height: canvasHeight }} onMouseDown={(event) => event.target === event.currentTarget && onSelect(null)}>
        <div className="absolute left-8 top-7 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-[#a4a197]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#e15e45]" />
          Research canvas
        </div>
        {batchMarkers.map((batch) => <div className={`batch-marker ${activeBatchId === batch.id ? "active" : ""}`} data-update-batch={batch.id} style={{ top: Math.max(58, batch.y - 38) }} key={batch.id}><span>{t("updateBatch")}</span><time>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(batch.at))}</time><small>{batch.cardCount}</small><i /></div>)}
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="loading-mark" />
          </div>
        ) : cards.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[360px] text-center">
              <p className="text-[18px] font-semibold tracking-[-0.02em] text-[#343530]">{t("emptyBoard")}</p>
              <p className="mt-2 text-[12px] leading-6 text-[#88867e]">{t("emptyBoardHint")}</p>
              <button className="primary-button mx-auto mt-5" type="button" onClick={onAddNote}>
                <PlusIcon className="h-4 w-4" /> {t("addNote")}
              </button>
            </div>
          </div>
        ) : visibleBundles.length === 0 ? (
          <div className="absolute left-0 right-0 top-32 text-center text-[11px] text-[#99978f]">{t("noFilteredCards")}</div>
        ) : (
          visibleBundles.map((bundle, bundleIndex) => {
            const card = displayedCards[bundleIndex];
            const activeIndex = bundle.cards.findIndex((item) => item.id === card.id);
            return <ResearchCard
              key={bundle.id}
              card={card}
              cardsInPack={bundle.cards}
              activeIndex={activeIndex}
              selected={selectedCardId === card.id}
              highlighted={highlightedCardId === card.id}
              dropTarget={dropTargetId === card.id}
              onDragMove={dragMove}
              onDragEnd={dragEnd}
              onResize={onResize}
              onSelect={onSelect}
              onOpen={onOpen}
              onNavigate={(nextIndex) => movePackIndex(bundle.id, nextIndex, bundle.cards)}
              onUnpack={onUnpack}
              onUnpackAll={onUnpackAll}
              onDelete={onDelete}
              onSetLocked={onSetLocked}
            />;
          })
        )}
      </div>
      </>}
    </section>
  );
}
