import { useMemo, useState } from "react";
import type { Card } from "../shared/contracts";
import { groupTimelineDays, type TimelineOrder } from "../lib/timeline";
import { useI18n } from "../i18n";
import "./timeline.css";

export function Timeline({ cards, onOpen }: { cards: Card[]; onOpen(cardId: string): void }) {
  const { t, locale } = useI18n();
  const [order, setOrder] = useState<TimelineOrder>("newest");
  const days = useMemo(() => groupTimelineDays(cards, order), [cards, order]);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: "full" });
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return <div className="timeline-view">
    <div className="timeline-heading">
      <p>{t("timelineHint")}</p>
      <select value={order} onChange={(event) => setOrder(event.target.value as TimelineOrder)} aria-label={t("timelineView")}>
        <option value="newest">{t("newestFirst")}</option>
        <option value="oldest">{t("oldestFirst")}</option>
      </select>
    </div>
    {days.length === 0 ? <p className="timeline-empty">{t("noFilteredCards")}</p> : days.map((day) => <section className="timeline-day" key={day.key}>
      <h2>{day.date ? dateFormat.format(day.date) : t("unknownDate")} <span>{day.entries.length}</span></h2>
      <ol>
        {day.entries.map(({ card, timestamp }) => <li key={card.id}>
          <button className="timeline-entry" type="button" onClick={() => onOpen(card.id)} title={t("jumpToCard")}>
            <div className="timeline-meta"><time>{timestamp === null ? t("unknownDate") : timeFormat.format(timestamp)}</time><span>{t(card.type)}</span>{card.sourceName && <span>{card.sourceName}</span>}</div>
            <strong>{card.title}</strong>
            <p>{card.content}</p>
            <span className="timeline-open">{t("jumpToCard")} →</span>
          </button>
        </li>)}
      </ol>
    </section>)}
  </div>;
}
