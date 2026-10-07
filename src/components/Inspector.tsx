import { useEffect, useState, type FormEvent } from "react";
import { formatRelativeTime, frequencyLabel } from "../lib/format";
import type { Card, CreateSourceInput, InformationChange, Project, Source, SourceCandidate, SourceType, TaskRun, UpdateCardInput } from "../shared/contracts";
import { AlertIcon, CheckIcon, ChevronIcon, ExternalIcon, LinkIcon, PlusIcon, SparkIcon, TrashIcon } from "./Icons";
import { api } from "../api";
import { useI18n } from "../i18n";
import { sourcePlatformLabel } from "../shared/source-platform";

function editableDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface InspectorProps {
  project: Project;
  sources: Source[];
  candidates: SourceCandidate[];
  taskRuns: TaskRun[];
  changes: InformationChange[];
  selectedCard: Card | null;
  discovering: boolean;
  apiConfigured: boolean;
  onCreateSource(input: CreateSourceInput): Promise<void>;
  onRemoveSource(sourceId: string): Promise<void>;
  onToggleSource(source: Source): Promise<void>;
  onRetrySource(source: Source): Promise<void>;
  onSaveCard(input: UpdateCardInput): Promise<void>;
  onRemoveCard(cardId: string): Promise<void>;
  onCloseCard(): void;
  onDiscover(): void;
  onAcceptCandidate(candidateId: string): Promise<void>;
  onDismissCandidate(candidateId: string): Promise<void>;
  onOpenSettings(): void;
  onResolveChange(changeId: string): void;
  onJumpToChange(change: InformationChange): void;
}

export function Inspector({
  project,
  sources,
  candidates,
  taskRuns,
  changes,
  selectedCard,
  discovering,
  apiConfigured,
  onCreateSource,
  onRemoveSource,
  onToggleSource,
  onRetrySource,
  onSaveCard,
  onRemoveCard,
  onCloseCard,
  onDiscover,
  onAcceptCandidate,
  onDismissCandidate,
  onOpenSettings,
  onResolveChange,
  onJumpToChange,
}: InspectorProps) {
  const { t, locale } = useI18n();
  const [openingData, setOpeningData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<SourceType>("rss");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardForm, setCardForm] = useState<UpdateCardInput | null>(null);
  const [savingCard, setSavingCard] = useState(false);

  useEffect(() => {
    // Background polling replaces Card objects; retain the active editing session.
    setCardForm(current => current?.id === selectedCard?.id ? current : selectedCard ? {
      id: selectedCard.id,
      type: selectedCard.type,
      title: selectedCard.title,
      content: selectedCard.content,
      occurredAt: selectedCard.occurredAt,
      importance: selectedCard.importance,
    } : null);
  }, [selectedCard]);

  const openDataFolder = async () => {
    if (openingData) return;
    setOpeningData(true);
    setDataError(null);
    try {
      await api.maintenance.openDataFolder();
    } catch (reason) {
      setDataError(reason instanceof Error ? reason.message : t("dataFolderError"));
    } finally {
      setOpeningData(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setSaving(true); setError(null);
    try {
      await onCreateSource({ projectId: project.id, type, name, url, checkFrequency: project.updateFrequency });
      setName(""); setUrl(""); setAdding(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法添加信息源");
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="inspector flex h-full w-[306px] shrink-0 flex-col overflow-y-auto border-l border-black/[0.07] bg-[#f7f5f0]">
      {cardForm && (
        <section className="card-editor border-b border-black/[0.07] px-5 py-5">
          <div className="flex items-center justify-between">
            <p className="inspector-heading">{t("cardDetails")}</p>
            <button className="mini-button" type="button" onClick={onCloseCard}>{t("close")}</button>
          </div>
          <select className="compact-field mt-3" value={cardForm.type} onChange={(event) => setCardForm({ ...cardForm, type: event.target.value as Card["type"] })}>
            <option value="news">新闻</option><option value="event">事件</option><option value="analysis">AI 分析</option>
            <option value="timeline">时间线</option><option value="source">来源</option><option value="note">笔记</option>
          </select>
          <input className="compact-field mt-2" value={cardForm.title} onChange={(event) => setCardForm({ ...cardForm, title: event.target.value })} placeholder="标题" />
          <textarea className="compact-area mt-2" value={cardForm.content} onChange={(event) => setCardForm({ ...cardForm, content: event.target.value })} placeholder="卡片内容" />
          <label className="field-label mt-3 block" htmlFor="card-event-date">{t("eventDate")}</label>
          <input id="card-event-date" className="compact-field mt-2" type="datetime-local" value={editableDate(cardForm.occurredAt ?? null)} onChange={(event) => {
            setCardForm({ ...cardForm, occurredAt: event.target.value ? new Date(event.target.value).toISOString() : null });
          }} />
          <p className="theme-text-muted mt-1 text-[9px] leading-4">{t("eventDateHint")}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="text-[9px] theme-text-secondary" htmlFor="card-importance">{t("importance")}</label>
            <select id="card-importance" className="h-7 rounded-md border border-black/10 bg-white px-2 text-[9px]" value={cardForm.importance} onChange={(event) => setCardForm({ ...cardForm, importance: Number(event.target.value) })}>
              <option value="1">{t("general")}</option><option value="2">{t("important")}</option><option value="3">{t("critical")}</option>
            </select>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button className="danger-link" type="button" onClick={() => void onRemoveCard(cardForm.id)}><TrashIcon className="h-3 w-3" />删除卡片</button>
            <button className="mini-button primary" type="button" disabled={savingCard || !cardForm.title.trim() || !cardForm.content.trim()} onClick={async () => {
              setSavingCard(true);
              try { await onSaveCard(cardForm); } finally { setSavingCard(false); }
            }}>{savingCard ? t("saving") : t("save")}</button>
          </div>
        </section>
      )}
      <section className="change-center border-b border-black/[0.07] px-5 py-5">
        <div className="flex items-center justify-between">
          <p className="inspector-heading">{t("changesTitle")}</p>
          {changes.filter((change) => !change.resolved).length > 0 && <span className="candidate-count">{changes.filter((change) => !change.resolved).length}</span>}
        </div>
        <p className="mt-2 text-[9px] leading-4 theme-text-secondary">{t("changesHint")}</p>
        <div className="mt-3 space-y-2">
          {changes.length === 0 && <p className="text-[9px] theme-text-muted">{t("noChanges")}</p>}
          {changes.slice(0, 12).map((change) => (
            <article className={`change-row ${change.kind} ${change.resolved ? "resolved" : ""}`} key={change.id}>
              <button className="change-row-target" type="button" onClick={() => onJumpToChange(change)}>
                <span className="flex items-start gap-2"><AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0"><strong className="block truncate">{change.title}</strong><span className="change-summary">{change.summary}</span><small>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(change.createdAt))}</small><span className="change-jump-hint">{t("jumpToCard")}<ChevronIcon className="h-3 w-3" /></span></span></span>
              </button>
              {!change.resolved && <button className="change-resolve" type="button" onClick={() => onResolveChange(change.id)}>{t("markResolved")}</button>}
            </article>
          ))}
        </div>
      </section>
      <section className="border-b border-black/[0.07] px-5 py-5">
        <p className="inspector-heading">{t("projectGoal")}</p>
        <p className="mt-3 text-[12px] leading-[1.7] theme-text-secondary">{project.goal}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {project.focus.map((item) => <span className="inspector-tag" key={item}>{item}</span>)}
        </div>
      </section>

      <section className="border-b border-black/[0.07] px-5 py-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="inspector-heading">{t("sources")}</p>
            <p className="mt-1 text-[9px] theme-text-muted">{sources.length} · {frequencyLabel(project.updateFrequency, locale)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="discover-button" type="button" disabled={discovering} onClick={onDiscover}>
              <SparkIcon className={`h-3 w-3 ${discovering ? "animate-pulse" : ""}`} />{discovering ? `${t("discover")}…` : t("discover")}
            </button>
            <button className="small-icon-button" type="button" onClick={() => setAdding((value) => !value)} aria-label="手动添加信息源">
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {!apiConfigured && (
          <button className="api-hint mt-4" type="button" onClick={onOpenSettings}>
            <SparkIcon className="h-3.5 w-3.5" />
            <span><strong>{t("configureAi")}</strong><small>{t("socialSearchRequiresAi")}</small></span>
          </button>
        )}

        {adding && (
          <form className="source-form mt-4 animate-fade-in" onSubmit={submit}>
            <div className="source-type-switch">
              <button className={type === "rss" ? "selected" : ""} type="button" onClick={() => setType("rss")}>RSS</button>
              <button className={type === "web" ? "selected" : ""} type="button" onClick={() => setType("web")}>网页</button>
              <button className={type === "search" ? "selected" : ""} type="button" onClick={() => setType("search")}>{t("socialSearch")}</button>
            </div>
            <input className="compact-field mt-3" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("sourceName")} />
            <input className="compact-field mt-2" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" inputMode="url" />
            {error && <p className="mt-2 text-[9px] leading-4 text-[#bf4937]">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button className="mini-button" type="button" onClick={() => setAdding(false)}>{t("cancel")}</button>
              <button className="mini-button primary" type="submit" disabled={saving || !name.trim() || !url.trim()}>{saving ? t("saving") : t("addSource")}</button>
            </div>
          </form>
        )}

        {candidates.length > 0 && (
          <div className="candidate-panel mt-4">
            <div className="flex items-center justify-between px-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] theme-text-secondary">{t("pendingSources")}</p>
              <span className="candidate-count">{candidates.length}</span>
            </div>
            <div className="mt-2 space-y-2">
              {candidates.map((candidate) => (
                <article className="candidate-row" key={candidate.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[10px] font-semibold theme-text-primary">{candidate.name}</p>
                        {candidate.verified && <span className="verified-badge"><CheckIcon className="h-2.5 w-2.5" />已验证</span>}
                      </div>
                      <p className="mt-1 truncate text-[8px] uppercase tracking-[0.08em] theme-text-muted">{sourcePlatformLabel(candidate.platform)} · {candidate.type} · {Math.round(candidate.confidence * 100)}% 可信</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[9px] leading-4 theme-text-secondary">{candidate.rationale}</p>
                  <div className="mt-2 flex justify-end gap-1">
                    <button className="mini-button" type="button" onClick={() => void onDismissCandidate(candidate.id)}>{t("ignore")}</button>
                    <button className="mini-button primary" type="button" onClick={() => void onAcceptCandidate(candidate.id)}>{t("addSource")}</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-1">
          {sources.length === 0 && !adding && (
            <button className="empty-source" type="button" onClick={() => setAdding(true)}>
              <LinkIcon className="h-4 w-4" />
              <span><strong>{t("addFirstSource")}</strong><small>{t("supportsRssWeb")}</small></span>
            </button>
          )}
          {sources.map((source) => (
            <div className="source-row group" key={source.id}>
              <div className={`source-status ${source.status}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium theme-text-primary">{source.name}</p>
                <p className="mt-0.5 truncate text-[9px] theme-text-muted">{sourcePlatformLabel(source.platform)}{source.type === "search" ? ` · ${t("searchSource")}` : ""} · {formatRelativeTime(source.lastCheckedAt, locale)}</p>
                {source.lastError && <p className="mt-1 truncate text-[9px] text-[#bf4937]">{source.lastError}</p>}
              </div>
              <button className="source-action opacity-0 group-hover:opacity-100" type="button" onClick={() => void (source.status === "error" ? onRetrySource(source) : onToggleSource(source))}>
                {source.status === "error" ? t("retry") : source.status === "paused" ? t("resume") : t("pause")}
              </button>
              <button className="source-remove opacity-0 group-hover:opacity-100" type="button" onClick={() => void onRemoveSource(source.id)} aria-label={`移除 ${source.name}`}>
                <TrashIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-5">
        <p className="inspector-heading">{t("workStatus")}</p>
        <dl className="mt-4 space-y-3">
          <div className="flex items-center justify-between"><dt className="text-[10px] theme-text-secondary">Agent</dt><dd className="flex items-center gap-1.5 text-[10px] font-medium theme-text-primary"><span className={`h-1.5 w-1.5 rounded-full ${project.status === "active" ? "bg-[#5d8468]" : "bg-[#aaa79e]"}`} />{project.status === "active" ? "运行中" : "已暂停"}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-[10px] theme-text-secondary">{t("cardCount")}</dt><dd className="text-[10px] font-medium theme-text-primary">{project.cardCount}</dd></div>
          <div className="flex items-center justify-between"><dt className="text-[10px] theme-text-secondary">{t("dataLocation")}</dt><dd><button className="data-folder-link" type="button" title={t("openDataFolder")} aria-label={t("openDataFolder")} disabled={openingData} onClick={() => void openDataFolder()}>{openingData ? t("openingDataFolder") : t("thisDevice")} <ExternalIcon className="h-3 w-3" /></button></dd></div>
        </dl>
        {dataError && <p className="data-folder-error" role="alert">{dataError}</p>}
        <div className="mt-5 border-t border-black/[0.06] pt-4">
          <p className="inspector-heading">{t("recentTasks")}</p>
          <div className="mt-3 space-y-2">
            {taskRuns.length === 0 && <p className="text-[9px] leading-4 theme-text-muted">{t("noTasks")}</p>}
            {taskRuns.slice(0, 5).map((run) => (
              <article className="task-run" key={run.id} title={[...run.errors, ...run.warnings].join("\n")}>
                <div className="flex items-center justify-between gap-2">
                  <strong>{run.kind === "discovery" ? "来源发现" : "信息检查"}</strong>
                  <span className={`task-status ${run.status}`}>{run.status === "completed" ? "完成" : run.status === "partial" ? "部分完成" : run.status === "failed" ? "失败" : "运行中"}</span>
                </div>
                <p>{run.summary ?? (run.errors[0] || "任务执行完成")}</p>
                <small>{formatRelativeTime(run.finishedAt ?? run.startedAt, locale)}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

    </aside>
  );
}
