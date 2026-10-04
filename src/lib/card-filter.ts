import type { Card } from "../shared/contracts";

export type CardFilter = "all" | Card["type"];

export function filterCards(cards: Card[], filter: CardFilter, query: string): Card[] {
  const needle = query.trim().toLowerCase();
  return cards.filter((card) => (
    (filter === "all" || card.type === filter)
    && (!needle || `${card.title}\n${card.content}\n${card.sourceName ?? ""}`.toLowerCase().includes(needle))
  ));
}
