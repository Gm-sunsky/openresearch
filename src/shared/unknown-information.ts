/** Missing evidence is a state, never a factual claim that nothing happened. */
export function unknownLabel(language = "zh-CN"): string {
  const labels: Record<string, string> = {
    "zh-CN": "未知", en: "Unknown", ru: "Неизвестно", fr: "Inconnu",
    de: "Unbekannt", ja: "不明", ko: "알 수 없음",
  };
  return labels[language] ?? labels.en;
}

export function coverageStatement(row: { status: string; statement: string }, language = "zh-CN"): string {
  return row.status === "no_evidence" ? unknownLabel(language) : row.statement;
}

/** Only recognize old application-generated boilerplate, not arbitrary negative facts. */
export function compactUnknownInformation(content: string, language = "zh-CN"): string {
  const unknown = unknownLabel(language);
  return content.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*(?:[•*-]\s*)?)(.*)$/);
    if (!match) return line;
    const [, bullet, body] = match;
    const gap = body.match(/^(.*?[:：]\s*)?((?:截至本次更新，已核对 \d+ 条来源材料，但没有找到可直接支持|暂无可引用证据；覆盖缺口|本次没有采集到可读取的正文，请检查来源错误|已采集到来源正文，但没有找到与该关注项直接匹配的内容|No citable evidence; coverage gap|This update checked \d+ source items but found no evidence directly supporting|No readable source content was collected; check source errors|Source content was collected, but none matched this focus directly).*)$/i);
    if (gap) return `${bullet}${gap[1] ?? ""}${unknown}`;
    // The second line belongs to the old generated coverage-gap paragraph.
    if (/^已检查对象：.+。这表示当前来源覆盖不足，不代表确定没有变化。[\s]*$/.test(body)
      || /^Checked entities: .+\. This indicates a coverage gap, not proof that nothing changed\.[\s]*$/i.test(body)) return null;
    return line;
  }).filter((line) => line !== null).join("\n");
}
