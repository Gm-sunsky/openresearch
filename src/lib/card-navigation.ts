import type { Card } from "../shared/contracts";
import { groupCardBundles } from "./card-packs";

export interface CardNavigationTarget {
  card: Card;
  bundleId: string;
  packIndex: number;
}

export function cardNavigationTarget(cards: Card[], cardId: string): CardNavigationTarget | null {
  for (const bundle of groupCardBundles(cards)) {
    const packIndex = bundle.cards.findIndex((card) => card.id === cardId);
    if (packIndex >= 0) return { card: bundle.cards[packIndex], bundleId: bundle.id, packIndex };
  }
  return null;
}
