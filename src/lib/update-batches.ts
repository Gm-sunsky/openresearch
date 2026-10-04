import type { Card } from "../shared/contracts";

export interface UpdateBatchRegion {
  id: string;
  at: string;
  y: number;
  cardCount: number;
}

export function buildUpdateBatchRegions(cards: Card[]): UpdateBatchRegion[] {
  const groups = new Map<string, UpdateBatchRegion>();
  for (const card of cards) {
    if (!card.updateBatchId || !card.updateBatchAt) continue;
    const current = groups.get(card.updateBatchId);
    groups.set(card.updateBatchId, {
      id: card.updateBatchId,
      at: current && current.at > card.updateBatchAt ? current.at : card.updateBatchAt,
      y: Math.min(current?.y ?? card.position.y, card.position.y),
      cardCount: (current?.cardCount ?? 0) + 1,
    });
  }
  return [...groups.values()].sort((left, right) => left.y - right.y || left.at.localeCompare(right.at));
}

export function activeUpdateBatch(regions: UpdateBatchRegion[], scrollTop: number): string | null {
  if (!regions.length) return null;
  let active = regions[0];
  for (const region of regions) {
    if (region.y > scrollTop) break;
    active = region;
  }
  return active.id;
}
