import { ConfirmDialog } from "./components/ConfirmDialog";
import { useConfirmation } from "./lib/use-confirmation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Board, type CardFocusRequest } from "./components/Board";
import { CardReader } from "./components/CardReader";
import { groupCardBundles } from "./lib/card-packs";
import { CreateProjectDialog } from "./components/CreateProjectDialog";
import { Inspector } from "./components/Inspector";
import { ChevronIcon, MoreIcon, PlusIcon, RefreshIcon, SparkIcon } from "./components/Icons";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { informationDepthPolicy } from "./shared/information-depth";
import { frequencyLabel } from "./lib/format";
import type { AiSettings, Card, CreateSourceInput, InformationChange, Project, Source, SourceCandidate, TaskRun, UpdateCardInput, UpdateProjectInput } from "./shared/contracts";
import { useI18n } from "./i18n";

interface Toast {
  id: number;
  message: string;
  tone: "default" | "error";
}

export default function App() {
  const { t, locale, setLanguage } = useI18n();
  const confirmation = useConfirmation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>([]);
  const [changes, setChanges] = useState<InformationChange[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [discoveringIds, setDiscoveringIds] = useState<Set<string>>(new Set());
  const [selectionSaving, setSelectionSaving] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const detailRequest = useRef(0);
  const projectRequest = useRef(0);
  const updatingRef = useRef(new Set<string>());
  const discoveringRef = useRef(new Set<string>());
  const selectionSavingRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [readerCardId, setReaderCardId] = useState<string | null>(null);
  const [cardFocusRequest, setCardFocusRequest] = useState<CardFocusRequest | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const project = useMemo(() => projects.find((item) => item.id === selectedId) ?? null, [projects, selectedId]);
  const selectedForUpdate = projects.filter((item) => item.updateSelected === true);
  const readyForUpdate = selectedForUpdate.filter((item) => !updatingIds.has(item.id));
  const discovering = selectedId !== null && discoveringIds.has(selectedId);
  const selectedCard = useMemo(() => cards.find((item) => item.id === selectedCardId) ?? null, [cards, selectedCardId]);
  const readerCard = cards.find((item) => item.id === readerCardId && item.projectId === selectedId);
  const readerCards = readerCard ? groupCardBundles(cards).find((bundle) => bundle.cards.some((item) => item.id === readerCard.id))?.cards ?? [readerCard] : [];

  const notify = useCallback((message: string, tone: Toast["tone"] = "default") => {
    const next = { id: Date.now(), message, tone };
    setToast(next);
    window.setTimeout(() => setToast((current) => current?.id === next.id ? null : current), 3_200);
  }, []);

  const selectProject = useCallback((projectId: string | null) => {
    if (selectedIdRef.current === projectId) return;
    selectedIdRef.current = projectId;
    detailRequest.current += 1;
    setSelectedId(projectId);
    setCards([]); setSources([]); setCandidates([]); setTaskRuns([]); setChanges([]);
    setSelectedCardId(null); setCardFocusRequest(null); setLoading(Boolean(projectId));
    setReaderCardId(null);
    setProjectSettingsOpen(false);
  }, []);

  const loadProjects = useCallback(async () => {
    const request = ++projectRequest.current;
    const next = await api.projects.list();
    if (request !== projectRequest.current) return;
    setProjects(next);
    if (!next.some((item) => item.id === selectedIdRef.current)) selectProject(next[0]?.id ?? null);
  }, [selectProject]);

  const reloadProject = useCallback(async (projectId: string) => {
    if (selectedIdRef.current !== projectId) return;
    const request = ++detailRequest.current;
    try {
      const [nextCards, nextSources, nextCandidates, nextRuns, nextChanges] = await Promise.all([
        api.cards.list(projectId), api.sources.list(projectId), api.discovery.list(projectId),
        api.updates.history(projectId), api.changes.list(projectId),
      ]);
      if (selectedIdRef.current !== projectId || request !== detailRequest.current) return;
      setCards(nextCards); setSources(nextSources); setCandidates(nextCandidates); setTaskRuns(nextRuns); setChanges(nextChanges);
    } catch (error) {
      if (selectedIdRef.current === projectId && request === detailRequest.current) {
        notify(error instanceof Error ? error.message : "无法读取项目内容", "error");
      }
    } finally {
      if (selectedIdRef.current === projectId && request === detailRequest.current) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadProjects().catch((error) => notify(error instanceof Error ? error.message : "无法读取项目", "error"));
    void api.settings.get().then((value) => { setSettings(value); setLanguage(value.language); }).catch((error) => notify(error instanceof Error ? error.message : "无法读取 API 设置", "error"));
  }, [loadProjects, notify, setLanguage]);

  useEffect(() => {
    if (selectedId) void reloadProject(selectedId);
    else setLoading(false);
  }, [selectedId, reloadProject]);

  useEffect(() => api.updates.onChanged?.(() => {
    void loadProjects().catch(() => {});
    const projectId = selectedIdRef.current;
    if (projectId) void reloadProject(projectId);
  }), [loadProjects, reloadProject]);

  const toggleUpdateSelection = async (projectId: string, selected: boolean) => {
    if (selectionSavingRef.current) return;
    selectionSavingRef.current = true;
    setSelectionSaving(true);
    const ids = projects.filter((item) => item.id === projectId ? selected : item.updateSelected === true).map((item) => item.id);
    try {
      const saved = await api.updates.select(ids);
      projectRequest.current += 1;
      const flags = new Map(saved.map((item) => [item.id, item.updateSelected === true]));
      setProjects((current) => current.map((item) => flags.has(item.id) ? { ...item, updateSelected: flags.get(item.id) } : item));
    } catch (error) {
      notify(error instanceof Error ? error.message : "更新项目选择保存失败", "error");
    } finally {
      selectionSavingRef.current = false;
      setSelectionSaving(false);
    }
  };

  const updateCardPosition = async (cardId: string, position: { x: number; y: number }) => {
    const movingCard = cards.find((card) => card.id === cardId);
    setCards((current) => current.map((card) => (
      card.id === cardId || (movingCard?.packId && card.packId === movingCard.packId) ? { ...card, position } : card
    )));
    try {
      await api.cards.updateLayout({ id: cardId, position });
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡片位置保存失败", "error");
      if (selectedId) await reloadProject(selectedId);
    }
  };

  const updateCardSize = async (cardId: string, position: { x: number; y: number }, size: { width: number; height: number }) => {
    const resizedCard = cards.find((card) => card.id === cardId);
    setCards((current) => current.map((card) => (
      card.id === cardId || (resizedCard?.packId && card.packId === resizedCard.packId) ? { ...card, position, size } : card
    )));
    try {
      await api.cards.updateLayout({ id: cardId, position, size });
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡片尺寸保存失败", "error");
      if (selectedId) await reloadProject(selectedId);
    }
  };

  const packCards = async (sourceCardId: string, targetCardId: string) => {
    try {
      await api.cards.pack({ sourceCardId, targetCardId });
      if (selectedId) await reloadProject(selectedId);
      if (selectedIdRef.current === selectedId) setSelectedCardId(targetCardId);
      notify("卡片已打包，可滚动或横滑切换");
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡片打包失败", "error");
      if (selectedId) await reloadProject(selectedId);
    }
  };

  const unpackCard = async (cardId: string) => {
    try {
      await api.cards.unpack(cardId);
      if (selectedId) await reloadProject(selectedId);
      if (selectedIdRef.current === selectedId) setSelectedCardId(cardId);
      notify("当前卡片已从卡包拆出");
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡片拆出失败", "error");
    }
  };

  const unpackAllCards = async (packId: string) => {
    try {
      await api.cards.unpackAll(packId);
      if (selectedId) await reloadProject(selectedId);
      if (selectedIdRef.current === selectedId) setSelectedCardId(null);
      notify("卡包已全部拆分");
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡包拆分失败", "error");
    }
  };

  const addNote = async () => {
    if (!selectedId) return;
    try {
      const card = await api.cards.create({
        projectId: selectedId,
        type: "note",
        title: "新的研究笔记",
        content: locale.startsWith("zh") ? "在右栏编辑笔记；双击卡片可完整查看资料。位置会自动保存。" : "Edit this note in the sidebar; double-click the card to read the full material. Its position is saved automatically.",
        position: { x: 110, y: 110 },
      });
      if (selectedIdRef.current === card.projectId) {
        setCards((current) => [card, ...current]);
        setSelectedCardId(card.id);
      }
      await loadProjects();
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法添加笔记", "error");
    }
  };

  const runProjectUpdate = async (target: Project) => {
    if (!target.updateSelected || updatingRef.current.has(target.id)) return;
    updatingRef.current.add(target.id);
    setUpdatingIds(new Set(updatingRef.current));
    try {
      const result = await api.updates.run(target.id);
      await reloadProject(target.id);
      await loadProjects();
      const detail = result.errors.length ? "，" + result.errors.length + " 个来源失败" : result.warnings.length ? "，" + result.warnings.length + " 项已自动降级" : "";
      notify(target.name + "：已检查 " + result.checkedSources + " 个来源，新增 " + result.newCards + " 张卡片" + detail, result.errors.length ? "error" : "default");
    } catch (error) {
      notify(target.name + "：" + (error instanceof Error ? error.message : "检查失败"), "error");
    } finally {
      updatingRef.current.delete(target.id);
      setUpdatingIds(new Set(updatingRef.current));
    }
  };

  const runUpdate = async () => {
    if (selectionSavingRef.current) return;
    await Promise.all(selectedForUpdate.map(runProjectUpdate));
  };

  const createSource = async (input: CreateSourceInput) => {
    await api.sources.create(input);
    await reloadProject(input.projectId);
    await loadProjects();
    notify("信息源已添加");
  };

  const removeSource = async (sourceId: string) => {
    const source = sources.find((item) => item.id === sourceId);
    if (source && !await confirmation.confirm(`移除信息源「${source.name}」？已生成的卡片不会被删除。`)) return;
    await api.sources.remove(sourceId);
    if (source) await reloadProject(source.projectId);
    await loadProjects();
    notify("信息源已移除");
  };

  const toggleSource = async (source: Source) => {
    await api.sources.update({ id: source.id, status: source.status === "paused" ? "active" : "paused" });
    await reloadProject(source.projectId);
    notify(source.status === "paused" ? "信息源已恢复" : "信息源已暂停");
  };

  const retrySource = async (source: Source) => {
    const target = projects.find((item) => item.id === source.projectId);
    if (!target?.updateSelected) { notify("请先在侧栏勾选此项目，再重试更新", "error"); return; }
    if (updatingRef.current.has(source.projectId)) return;
    await api.sources.update({ id: source.id, status: "active" });
    await runProjectUpdate(target);
  };

  const saveCard = async (input: UpdateCardInput) => {
    try {
      const updated = await api.cards.update(input);
      if (selectedIdRef.current === updated.projectId) setCards((current) => current.map((card) => card.id === updated.id ? updated : card));
      notify("卡片已保存");
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡片保存失败", "error");
    }
  };

  const removeCard = async (cardId: string) => {
    const card = cards.find((item) => item.id === cardId);
    if (!card || !await confirmation.confirm(`删除卡片「${card.title}」？`)) return;
    try {
      await api.cards.remove(cardId);
      if (selectedIdRef.current === selectedId) setSelectedCardId(null);
      if (selectedId) await reloadProject(selectedId);
      await loadProjects();
      notify("卡片已删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "卡片删除失败", "error");
    }
  };

  const setCardLocked = async (cardId: string, locked: boolean) => {
    try {
      const updated = await api.cards.setLocked({ id: cardId, locked });
      if (selectedIdRef.current === updated.projectId) setCards((current) => current.map((card) => card.id === updated.id ? updated : card));
      notify(locked ? t("lockImportant") : t("unlockImportant"));
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法更新重要卡片", "error");
    }
  };

  const resolveChange = async (changeId: string) => {
    await api.changes.resolve(changeId);
    if (selectedIdRef.current === selectedId) setChanges((current) => current.map((change) => change.id === changeId ? { ...change, resolved: true } : change));
  };

  const jumpToChange = (change: InformationChange) => {
    const target = cards.find((card) => card.id === change.cardId)
      ?? cards.find((card) => card.id === change.previousCardId);
    if (!target) {
      notify(t("cardNotFound"), "error");
      return;
    }
    setSelectedCardId(target.id);
    setCardFocusRequest({ cardId: target.id, requestId: Date.now() });
    notify(t("cardLocated"));
  };

  const saveProject = async (input: UpdateProjectInput) => {
    const updated = await api.projects.update(input);
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...updated, updateSelected: item.updateSelected } : item));
    await reloadProject(input.id);
    notify("项目设置已保存");
  };

  const toggleProject = async () => {
    if (!project) return;
    const updated = await api.projects.update({
      id: project.id,
      name: project.name,
      description: project.description,
      goal: project.goal,
      focus: project.focus,
      updateFrequency: project.updateFrequency,
      informationDepth: project.informationDepth,
      status: project.status === "paused" ? "active" : "paused",
    });
    setProjects((current) => current.map((item) => item.id === updated.id ? { ...updated, updateSelected: item.updateSelected } : item));
    notify(updated.status === "active" ? "项目 Agent 已恢复" : "项目 Agent 已暂停");
  };

  const runDiscovery = async () => {
    if (!selectedId || discoveringRef.current.has(selectedId)) return;
    discoveringRef.current.add(selectedId);
    setDiscoveringIds(new Set(discoveringRef.current));
    try {
      const result = await api.discovery.run(selectedId);
      await reloadProject(selectedId);
      await loadProjects();
      if (result.automaticallyAdded) {
        notify(`发现完成，已自动添加 ${result.automaticallyAdded} 个高可信来源`);
      } else if (result.candidates.length) {
        notify(`发现 ${result.candidates.length} 个候选来源，请确认后添加`);
      } else {
        notify(result.warnings[0] ?? "本次没有发现新的来源", result.warnings.length ? "error" : "default");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "来源发现失败", "error");
    } finally {
      discoveringRef.current.delete(selectedId);
      setDiscoveringIds(new Set(discoveringRef.current));
    }
  };

  const acceptCandidate = async (candidateId: string) => {
    if (!selectedId) return;
    try {
      const result = await api.discovery.accept({ projectId: selectedId, candidateIds: [candidateId] });
      if (selectedId) await reloadProject(selectedId);
      notify(result.added.length ? "来源已添加并开始监控" : "该来源无法添加或已存在", result.added.length ? "default" : "error");
    } catch (error) {
      notify(error instanceof Error ? error.message : "来源添加失败", "error");
    }
  };

  const dismissCandidate = async (candidateId: string) => {
    try {
      await api.discovery.dismiss(candidateId);
      if (selectedIdRef.current === selectedId) setCandidates((current) => current.filter((candidate) => candidate.id !== candidateId));
    } catch (error) {
      notify(error instanceof Error ? error.message : "无法忽略该来源", "error");
    }
  };

  const deleteProject = async () => {
    if (!project || !await confirmation.confirm(`删除「${project.name}」及其全部卡片和信息源？此操作无法撤销。`)) return;
    try {
      await api.projects.remove(project.id);
      if (selectedIdRef.current === project.id) { setProjectSettingsOpen(false); selectProject(null); }
      await loadProjects();
      notify("项目已删除");
    } catch (error) {
      notify(error instanceof Error ? error.message : "删除项目失败", "error");
    }
  };

  return (
    <main className="app-workspace flex h-screen min-h-[680px] overflow-hidden theme-text-primary">
      <ProjectSidebar
        projects={projects}
        selectedId={selectedId}
        onSelect={selectProject}
        onToggleUpdate={(id, selected) => void toggleUpdateSelection(id, selected)}
        updatingIds={updatingIds}
        selectionSaving={selectionSaving}
        onCreate={() => setCreateOpen(true)}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {project ? (
          <>
            <header className="workspace-header flex h-[72px] shrink-0 items-center justify-between border-b border-black/[0.07] px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-[0.13em] theme-text-muted">
                  {t("projects")} <ChevronIcon className="h-3 w-3" /> {t("activeBoard")}
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <h1 className="truncate text-[19px] font-semibold tracking-[-0.035em] theme-text-primary">{project.name}</h1>
                  <button className={`status-badge ${project.status}`} type="button" onClick={() => void toggleProject()} title={t("projectSettings")}><span />{project.status === "active" ? t("active") : t("paused")}</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-2 hidden text-[10px] theme-text-secondary xl:block">{informationDepthPolicy(project.informationDepth).label} · {project.updateSelected ? "已选更新 · " + frequencyLabel(project.updateFrequency, locale) : "未选更新"}</span>
                <button className="secondary-button" type="button" onClick={addNote}><PlusIcon className="h-3.5 w-3.5" />{t("newCard")}</button>
                <button className="primary-button" type="button" disabled={selectionSaving || !readyForUpdate.length} onClick={() => void runUpdate()} title="只更新侧栏中勾选的项目，查看项目不会改变勾选">
                  <RefreshIcon className={"h-3.5 w-3.5 " + (updatingIds.size ? "animate-spin" : "")} />{readyForUpdate.length ? "更新选中项目（" + readyForUpdate.length + "）" : updatingIds.size ? "更新中（" + updatingIds.size + "）" : "请勾选更新项目"}
                </button>
                <button className="header-more" type="button" aria-label="项目设置" title="项目设置" onClick={() => setProjectSettingsOpen(true)}><MoreIcon className="h-4 w-4" /></button>
              </div>
            </header>

            <div className="flex min-h-0 flex-1">
              <Board
                cards={cards}
                loading={loading}
                onMove={updateCardPosition}
                onResize={(cardId, position, size) => void updateCardSize(cardId, position, size)}
                onAddNote={addNote}
                selectedCardId={selectedCardId}
                onSelect={setSelectedCardId}
                onOpen={setReaderCardId}
                onPack={(sourceCardId, targetCardId) => void packCards(sourceCardId, targetCardId)}
                onUnpack={(cardId) => void unpackCard(cardId)}
                onUnpackAll={(packId) => void unpackAllCards(packId)}
                onDelete={(cardId) => void removeCard(cardId)}
                onSetLocked={(cardId, locked) => void setCardLocked(cardId, locked)}
                focusRequest={cardFocusRequest}
              />
              <Inspector
                project={project}
                sources={sources}
                candidates={candidates}
                taskRuns={taskRuns}
                changes={changes}
                selectedCard={selectedCard}
                discovering={discovering}
                apiConfigured={settings?.provider === "openai-compatible" ? Boolean(settings.model) : Boolean(settings?.apiKeyConfigured)}
                onCreateSource={createSource}
                onRemoveSource={removeSource}
                onToggleSource={toggleSource}
                onRetrySource={retrySource}
                onSaveCard={saveCard}
                onRemoveCard={removeCard}
                onCloseCard={() => setSelectedCardId(null)}
                onDiscover={() => void runDiscovery()}
                onAcceptCandidate={acceptCandidate}
                onDismissCandidate={dismissCandidate}
                onOpenSettings={() => setSettingsOpen(true)}
                onResolveChange={(changeId) => void resolveChange(changeId)}
                onJumpToChange={jumpToChange}
              />
            </div>
          </>
        ) : (
          <section className="flex flex-1 items-center justify-center">
            <div className="max-w-[430px] text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white text-[#e15e45]"><SparkIcon className="h-5 w-5" /></div>
              <h1 className="mt-6 text-[27px] font-semibold tracking-[-0.04em] theme-text-primary">{t("createFirst")}</h1>
              <p className="mt-3 text-[13px] leading-6 theme-text-secondary">{t("createFirstHint")}</p>
              <button className="primary-button mx-auto mt-6" type="button" onClick={() => setCreateOpen(true)}><PlusIcon className="h-4 w-4" />{t("newProject")}</button>
            </div>
          </section>
        )}
      </div>

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          projectRequest.current += 1;
          setProjects((current) => [created, ...current.filter((item) => item.id !== created.id)]);
          selectProject(created.id);
          notify("信息项目已建立；勾选后可更新");
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={(value) => { setSettings(value); setLanguage(value.language); }}
      />

      <ProjectSettingsDialog
        key={selectedId}
        open={projectSettingsOpen}
        project={project}
        onClose={() => { if (selectedIdRef.current === selectedId) setProjectSettingsOpen(false); }}
        onSave={saveProject}
        onDelete={deleteProject}
      />

      <ConfirmDialog message={confirmation.message} onResolve={confirmation.onResolve} />
      {toast && <div className={`toast ${toast.tone}`} key={toast.id}>{toast.message}</div>}
      {readerCard && <CardReader key={readerCard.projectId} card={readerCard} cards={readerCards} onNavigate={setReaderCardId} onClose={() => setReaderCardId(null)} />}
    </main>
  );
}
