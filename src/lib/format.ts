function languageCode(locale = "zh-CN"): "zh" | "en" | "ru" | "fr" | "de" | "ja" | "ko" {
  const value = locale.toLowerCase();
  if (value.startsWith("zh")) return "zh";
  for (const code of ["ru", "fr", "de", "ja", "ko"] as const) if (value.startsWith(code)) return code;
  return "en";
}

export function formatRelativeTime(value: string | null, locale = "zh-CN"): string {
  const code = languageCode(locale);
  if (!value) return { zh: "尚未检查", en: "Not checked", ru: "Не проверено", fr: "Non vérifié", de: "Nicht geprüft", ja: "未確認", ko: "확인 안 됨" }[code];
  const date = new Date(value);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "minute");
  if (diffMinutes < 60) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffMinutes, "minute");
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffHours, "hour");
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diffDays, "day");
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

export function frequencyLabel(value: string, locale = "zh-CN"): string {
  const translations = {
    zh: { hourly: "每小时", daily: "每天", weekly: "每周" }, en: { hourly: "Hourly", daily: "Daily", weekly: "Weekly" },
    ru: { hourly: "Каждый час", daily: "Ежедневно", weekly: "Еженедельно" }, fr: { hourly: "Chaque heure", daily: "Chaque jour", weekly: "Chaque semaine" },
    de: { hourly: "Stündlich", daily: "Täglich", weekly: "Wöchentlich" }, ja: { hourly: "毎時", daily: "毎日", weekly: "毎週" },
    ko: { hourly: "매시간", daily: "매일", weekly: "매주" },
  };
  return translations[languageCode(locale)][value as "hourly" | "daily" | "weekly"] ?? value;
}
