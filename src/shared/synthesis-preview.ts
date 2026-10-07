export interface PreviewCoverage {
  entity: string;
  status: "confirmed" | "conflict" | "no_evidence";
  statement: string;
}

function compact(text: string, budget: number): string {
  const cleaned = text.replace(/^[•*-]\s*/, "").replace(/\s+/g, " ").trim();
  return cleaned.length <= budget ? cleaned : `${cleaned.slice(0, Math.max(0, budget - 1))}…`;
}

/** An independent conclusion for the card face; the reader always retains the full text. */
export function synthesisOverview(
  input: { summary: string; coverage?: PreviewCoverage[] },
  language = "zh-CN",
  independentPreview?: unknown,
): string {
  const zh = language === "zh-CN";
  const rows = input.coverage ?? [];
  if (typeof independentPreview === "string" && independentPreview.trim() && independentPreview.trim().length <= 160
    && (rows.length <= 1 || rows.every((row) => independentPreview.includes(row.entity)))
    && (!rows.some(row => row.status === "no_evidence") || /缺证据|缺口|暂无|未确认|未确定|未知|no evidence|without evidence|unknown|unconfirmed|not confirmed|unavailable/i.test(independentPreview))
    && (!rows.some(row => row.status === "conflict") || /冲突|分歧|矛盾|不一致|conflict|contradict|disagree/i.test(independentPreview))) {
    return compact(independentPreview, 160);
  }
  if (rows.length) {
    const confirmed = rows.filter((row) => row.status === "confirmed").length;
    const conflict = rows.filter((row) => row.status === "conflict").length;
    const missing = rows.length - confirmed - conflict;
    const counts = zh
      ? `${rows.length}个对象：${confirmed}已确认，${conflict}有分歧，${missing}缺证据。`
      : `${rows.length} entities: ${confirmed} confirmed, ${conflict} conflicting, ${missing} without evidence. `;
    const available = Math.max(0, 160 - counts.length);
    const budget = Math.floor(available / rows.length);
    const parts = rows.map((row) => {
      const status = row.status === "conflict" ? (zh ? "分歧" : "conflict")
        : row.status === "no_evidence" ? (zh ? "缺证据" : "no evidence") : "";
      const conclusion = row.statement.split(/(?<=[。！？!?])\s*|(?<=\.)\s+|\n/)[0];
      return compact(`${row.entity}：${status || conclusion}`, Math.max(1, budget - 1));
    });
    return compact(counts + parts.join(zh ? "；" : "; "), 160);
  }
  const parts = input.summary.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!parts.length) return "";
  const selected = parts.length <= 4 ? parts : [parts[0], ...parts.filter((line) => /变更|变化|冲突|分歧|缺口|未核实|change|conflict|uncertain/i.test(line)).slice(0, 2), parts[parts.length - 1]];
  const unique = [...new Set(selected)];
  const budget = Math.floor(160 / unique.length);
  return compact(unique.map((line) => compact(line.split(/(?<=[。！？!?])\s*|(?<=\.)\s+/)[0], Math.max(1, budget - 1))).join(zh ? "；" : "; "), 160);
}
