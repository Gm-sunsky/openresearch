import type { Card } from "../shared/contracts";

export type TimelineOrder = "newest" | "oldest";
export interface TimelineEntry { card: Card; timestamp: number | null }
export interface TimelineDay { key: string; date: Date | null; entries: TimelineEntry[] }

export function timelineTimestamp(card: Card): number | null {
  for (const value of [card.occurredAt, card.createdAt]) {
    if (!value?.trim()) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

/** Groups by the same local calendar days shown in the interface. Unknown dates stay last. */
export function groupTimelineDays(cards: Card[], order: TimelineOrder): TimelineDay[] {
  const entries = cards.map((card) => ({ card, timestamp: timelineTimestamp(card) }));
  entries.sort((a, b) => {
    if (a.timestamp === null) return b.timestamp === null ? a.card.id.localeCompare(b.card.id) : 1;
    if (b.timestamp === null) return -1;
    return (order === "newest" ? b.timestamp - a.timestamp : a.timestamp - b.timestamp) || a.card.id.localeCompare(b.card.id);
  });
  const days = new Map<string, TimelineDay>();
  for (const entry of entries) {
    const date = entry.timestamp === null ? null : new Date(entry.timestamp);
    const key = date ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}` : "unknown";
    const day = days.get(key) ?? { key, date, entries: [] };
    day.entries.push(entry);
    days.set(key, day);
  }
  return [...days.values()];
}
