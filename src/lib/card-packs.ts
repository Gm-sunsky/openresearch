import type { Card } from "../shared/contracts";

export interface CardBundle {
  id: string;
  packId: string | null;
  cards: Card[];
}

export function groupCardBundles(cards: Card[]): CardBundle[] {
  const bundles = new Map<string, CardBundle>();
  for (const card of cards) {
    const id = card.packId ? `pack:${card.packId}` : `card:${card.id}`;
    const current = bundles.get(id);
    if (current) current.cards.push(card);
    else bundles.set(id, { id, packId: card.packId, cards: [card] });
  }
  return [...bundles.values()].map((bundle) => ({
    ...bundle,
    cards: [...bundle.cards].sort((left, right) => left.packOrder - right.packOrder || left.createdAt.localeCompare(right.createdAt)),
  }));
}

export function findPackingTarget(
  displayedCards: Card[],
  sourceCardId: string,
  position: { x: number; y: number },
): string | null {
  const source = displayedCards.find((card) => card.id === sourceCardId);
  if (!source) return null;
  const center = { x: position.x + source.size.width / 2, y: position.y + source.size.height / 2 };
  const candidates = displayedCards.filter((target) => (
    target.id !== source.id
    && (!source.packId || source.packId !== target.packId)
    && source.updateBatchId === target.updateBatchId
    && center.x >= target.position.x - 12
    && center.x <= target.position.x + target.size.width + 12
    && center.y >= target.position.y - 12
    && center.y <= target.position.y + target.size.height + 12
  ));
  candidates.sort((left, right) => {
    const leftDistance = Math.hypot(center.x - (left.position.x + left.size.width / 2), center.y - (left.position.y + left.size.height / 2));
    const rightDistance = Math.hypot(center.x - (right.position.x + right.size.width / 2), center.y - (right.position.y + right.size.height / 2));
    return leftDistance - rightDistance;
  });
  return candidates[0]?.id ?? null;
}
