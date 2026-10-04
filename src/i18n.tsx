import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLanguage } from "./shared/contracts";

type Key = keyof typeof zh;
type Dictionary = Record<Key, string>;

const zh = {
  projects: "信息项目", searchProjects: "搜索项目", settings: "设置", localWorkspace: "本地工作空间",
  dataOnDevice: "数据保存在此设备", cards: "张卡片", activeBoard: "当前白板", active: "运行中", paused: "已暂停",
  autoCheck: "自动检查", newCard: "新建卡片", checkUpdates: "检查更新", checking: "检查中…", projectSettings: "项目设置",
  all: "全部", news: "新闻", event: "事件", analysis: "分析", timeline: "时间线", source: "来源", note: "笔记",
  searchCards: "搜索卡片", emptyBoard: "这块白板还没有内容", emptyBoardHint: "添加一个信息源，或先写下一条研究笔记。",
  addNote: "添加笔记", noFilteredCards: "没有符合当前筛选的卡片", updateBatch: "更新批次", savedImportant: "锁定的重要卡片",
  updateNavigator: "更新节点", jumpToUpdate: "跳转到本次更新", latestBatch: "最新", combinedSources: "综合来源",
  latestUpdate: "最新更新", informationSource: "信息源", aiAnalysis: "AI 分析", coreInfo: "核心信息", openSource: "打开来源",
  editContent: "编辑内容", deleteCard: "删除卡片", unpackCurrent: "拆出当前卡片", unpackAll: "一键拆分卡包",
  lockImportant: "设为重要卡片", unlockImportant: "取消重要锁定", changed: "信息有变化", conflict: "信息有冲突",
  changesTitle: "变化与冲突", changesHint: "点击记录可直接定位到对应卡片。", noChanges: "尚未发现变化或冲突。",
  jumpToCard: "定位卡片", cardLocated: "已定位到对应卡片", cardNotFound: "对应卡片已被删除或自动清理",
  resolved: "已处理", markResolved: "标记已处理", projectGoal: "项目目标", sources: "信息源", discover: "发现来源",
  workStatus: "工作状态", recentTasks: "最近任务", cardDetails: "卡片详情", close: "关闭", save: "保存", saving: "保存中…",
  language: "界面与信息语言", system: "跟随系统", maxBatches: "保留更新批次", maxBatchesHint: "超过上限时删除最旧批次；锁定卡片始终保留。",
  apiAutomation: "API 与自动发现", serviceType: "服务类型", model: "模型", protocol: "接口协议", apiAddress: "API 地址",
  apiKey: "API 密钥", automation: "自动化", aiOrganize: "用 AI 整理新内容", saveSettings: "保存设置", testConnection: "测试连接",
  createFirst: "建立第一个信息项目", createFirstHint: "告诉 Agent 你希望长期关注的主题，它会建立白板、信息源和更新计划。",
  newProject: "新建项目", manualInfo: "手动与重要信息", batchMergeHint: "仅同一更新批次的卡片可以合并。",
  createProject: "创建信息项目", createProjectHint: "描述你希望长期关注的主题，系统会整理监控目标。", monitoringQuestion: "你想持续了解什么？",
  useExample: "使用示例", projectPreview: "项目配置预览", projectName: "项目名称", monitoringGoal: "监控目标", focusScope: "关注范围",
  waitingAnalysis: "等待分析需求", waitingAnalysisHint: "系统会提取项目名称、关注范围和检查频率。", noApiNeeded: "无需配置 AI 密钥即可开始",
  cancel: "取消", create: "创建", creating: "创建中…", analyze: "分析需求", analyzing: "分析中…", description: "简介", checkFrequency: "检查频率",
  focusPerLine: "关注范围（每行一项）", projectAgentSettings: "项目与 Agent 设置", addSource: "添加来源", sourceName: "来源名称",
  addFirstSource: "添加第一个来源", supportsRssWeb: "支持 RSS、网页、新媒体账号、论坛与个人博客", configureAi: "配置 AI 可主动寻找来源", socialSearch: "新媒体/账号", searchSource: "搜索更新", socialSearchRequiresAi: "RSS 和网页可直接检查；新媒体账号搜索需要支持 web_search 的 API。", pendingSources: "待确认来源",
  ignore: "忽略", retry: "重试", resume: "恢复", pause: "暂停", cardCount: "卡片数量", dataLocation: "数据位置", thisDevice: "此设备",
  deleteProject: "删除项目", deletingProject: "正在删除…", deleteProjectHint: "删除项目、卡片、来源和任务记录", noTasks: "尚无任务记录。发现来源或检查更新后会显示在这里。", importance: "重要程度", general: "一般", important: "重要", critical: "关键",
} as const;

const en: Dictionary = {
  projects:"Research projects",searchProjects:"Search projects",settings:"Settings",localWorkspace:"Local workspace",dataOnDevice:"Data stays on this device",cards:"cards",activeBoard:"Active board",active:"Active",paused:"Paused",autoCheck:"Auto check",newCard:"New card",checkUpdates:"Check updates",checking:"Checking…",projectSettings:"Project settings",all:"All",news:"News",event:"Events",analysis:"Analysis",timeline:"Timeline",source:"Sources",note:"Notes",searchCards:"Search cards",emptyBoard:"This board is empty",emptyBoardHint:"Add a source or write a research note.",addNote:"Add note",noFilteredCards:"No cards match this filter",updateBatch:"Update batch",savedImportant:"Locked important cards",updateNavigator:"Update nodes",jumpToUpdate:"Jump to this update",latestBatch:"Latest",combinedSources:"Combined sources",latestUpdate:"Latest update",informationSource:"Source",aiAnalysis:"AI analysis",coreInfo:"Key information",openSource:"Open source",editContent:"Edit content",deleteCard:"Delete card",unpackCurrent:"Remove current card",unpackAll:"Unpack all",lockImportant:"Mark important",unlockImportant:"Remove important lock",changed:"Information changed",conflict:"Information conflict",changesTitle:"Changes & conflicts",changesHint:"Click a record to jump directly to its card.",noChanges:"No changes or conflicts found.",jumpToCard:"Open card",cardLocated:"Jumped to the related card",cardNotFound:"The related card was deleted or automatically pruned",resolved:"Resolved",markResolved:"Mark resolved",projectGoal:"Project goal",sources:"Sources",discover:"Discover sources",workStatus:"Work status",recentTasks:"Recent tasks",cardDetails:"Card details",close:"Close",save:"Save",saving:"Saving…",language:"Interface & information language",system:"Use system language",maxBatches:"Update batches to keep",maxBatchesHint:"Oldest batches are removed at the limit; locked cards are always kept.",apiAutomation:"API & source discovery",serviceType:"Service",model:"Model",protocol:"Protocol",apiAddress:"API address",apiKey:"API key",automation:"Automation",aiOrganize:"Organize new content with AI",saveSettings:"Save settings",testConnection:"Test connection",createFirst:"Create your first research project",createFirstHint:"Tell the Agent what to follow long-term and it will build a board, sources, and update plan.",newProject:"New project",manualInfo:"Manual & important information",batchMergeHint:"Only cards from the same update batch can be merged.",createProject:"Create research project",createProjectHint:"Describe a topic to follow over time and the system will organize its monitoring goals.",monitoringQuestion:"What do you want to keep learning about?",useExample:"Use example",projectPreview:"Project preview",projectName:"Project name",monitoringGoal:"Monitoring goal",focusScope:"Focus",waitingAnalysis:"Waiting for analysis",waitingAnalysisHint:"The system will extract the project name, focus, and check frequency.",noApiNeeded:"No AI key is required to start",cancel:"Cancel",create:"Create",creating:"Creating…",analyze:"Analyze request",analyzing:"Analyzing…",description:"Description",checkFrequency:"Check frequency",focusPerLine:"Focus (one per line)",projectAgentSettings:"Project & Agent settings",addSource:"Add source",sourceName:"Source name",addFirstSource:"Add the first source",supportsRssWeb:"Supports RSS, web pages, social accounts, forums, and personal blogs",configureAi:"Configure AI source discovery",socialSearch:"New media/account",searchSource:"Search updates",socialSearchRequiresAi:"RSS and webpages are checked directly; account search requires an API with web_search support.",pendingSources:"Pending sources",ignore:"Ignore",retry:"Retry",resume:"Resume",pause:"Pause",cardCount:"Card count",dataLocation:"Data location",thisDevice:"This device",deleteProject:"Delete project",deletingProject:"Deleting…",deleteProjectHint:"Delete this project, its cards, sources, and task history",noTasks:"No task history yet. Source discovery and updates appear here.",importance:"Importance",general:"General",important:"Important",critical:"Critical",
};

const ru: Dictionary = { ...en, projects:"Информационные проекты",searchProjects:"Поиск проектов",settings:"Настройки",localWorkspace:"Локальное пространство",dataOnDevice:"Данные хранятся на устройстве",cards:"карточек",activeBoard:"Активная доска",active:"Активен",paused:"Приостановлен",autoCheck:"Автопроверка",newCard:"Новая карточка",checkUpdates:"Проверить обновления",checking:"Проверка…",all:"Все",news:"Новости",event:"События",analysis:"Анализ",timeline:"Хронология",source:"Источники",note:"Заметки",searchCards:"Поиск карточек",updateBatch:"Пакет обновления",savedImportant:"Важные закреплённые карточки",latestUpdate:"Последнее обновление",coreInfo:"Ключевая информация",lockImportant:"Отметить важной",unlockImportant:"Снять отметку",changed:"Информация изменилась",conflict:"Конфликт информации",changesTitle:"Изменения и конфликты",noChanges:"Изменений и конфликтов нет.",markResolved:"Отметить решённым",language:"Язык интерфейса и информации",system:"Язык системы",maxBatches:"Хранить пакетов обновлений",saveSettings:"Сохранить настройки",testConnection:"Проверить соединение",newProject:"Новый проект" };
const fr: Dictionary = { ...en, projects:"Projets d’information",searchProjects:"Rechercher des projets",settings:"Paramètres",localWorkspace:"Espace local",dataOnDevice:"Données stockées sur cet appareil",cards:"cartes",activeBoard:"Tableau actif",active:"Actif",paused:"En pause",autoCheck:"Vérification auto",newCard:"Nouvelle carte",checkUpdates:"Vérifier les mises à jour",checking:"Vérification…",all:"Tout",news:"Actualités",event:"Événements",analysis:"Analyse",timeline:"Chronologie",source:"Sources",note:"Notes",searchCards:"Rechercher des cartes",updateBatch:"Lot de mise à jour",savedImportant:"Cartes importantes verrouillées",latestUpdate:"Dernière mise à jour",coreInfo:"Informations clés",lockImportant:"Marquer comme importante",unlockImportant:"Retirer le verrou",changed:"Information modifiée",conflict:"Information contradictoire",changesTitle:"Modifications et conflits",noChanges:"Aucune modification ni conflit.",markResolved:"Marquer comme traité",language:"Langue de l’interface et des informations",system:"Langue du système",maxBatches:"Lots de mise à jour conservés",saveSettings:"Enregistrer",testConnection:"Tester la connexion",newProject:"Nouveau projet" };
const de: Dictionary = { ...en, projects:"Informationsprojekte",searchProjects:"Projekte suchen",settings:"Einstellungen",localWorkspace:"Lokaler Arbeitsbereich",dataOnDevice:"Daten bleiben auf diesem Gerät",cards:"Karten",activeBoard:"Aktives Board",active:"Aktiv",paused:"Pausiert",autoCheck:"Automatische Prüfung",newCard:"Neue Karte",checkUpdates:"Updates prüfen",checking:"Prüfung…",all:"Alle",news:"Nachrichten",event:"Ereignisse",analysis:"Analyse",timeline:"Zeitachse",source:"Quellen",note:"Notizen",searchCards:"Karten suchen",updateBatch:"Update-Stapel",savedImportant:"Gesperrte wichtige Karten",latestUpdate:"Neuestes Update",coreInfo:"Kerninformationen",lockImportant:"Als wichtig markieren",unlockImportant:"Wichtigkeit aufheben",changed:"Information geändert",conflict:"Informationskonflikt",changesTitle:"Änderungen & Konflikte",noChanges:"Keine Änderungen oder Konflikte.",markResolved:"Als erledigt markieren",language:"Sprache für Oberfläche und Informationen",system:"Systemsprache",maxBatches:"Behaltene Update-Stapel",saveSettings:"Einstellungen speichern",testConnection:"Verbindung testen",newProject:"Neues Projekt" };
const ja: Dictionary = { ...en, projects:"情報プロジェクト",searchProjects:"プロジェクトを検索",settings:"設定",localWorkspace:"ローカルワークスペース",dataOnDevice:"データはこの端末に保存",cards:"枚のカード",activeBoard:"現在のボード",active:"稼働中",paused:"一時停止",autoCheck:"自動確認",newCard:"新しいカード",checkUpdates:"更新を確認",checking:"確認中…",all:"すべて",news:"ニュース",event:"イベント",analysis:"分析",timeline:"タイムライン",source:"情報源",note:"ノート",searchCards:"カードを検索",updateBatch:"更新バッチ",savedImportant:"ロックされた重要カード",latestUpdate:"最新情報",coreInfo:"重要情報",lockImportant:"重要カードに設定",unlockImportant:"重要ロックを解除",changed:"情報が変更",conflict:"情報が矛盾",changesTitle:"変更と矛盾",noChanges:"変更や矛盾はありません。",markResolved:"対応済みにする",language:"画面と情報の言語",system:"システム言語",maxBatches:"保持する更新バッチ",saveSettings:"設定を保存",testConnection:"接続テスト",newProject:"新規プロジェクト" };
const ko: Dictionary = { ...en, projects:"정보 프로젝트",searchProjects:"프로젝트 검색",settings:"설정",localWorkspace:"로컬 작업 공간",dataOnDevice:"데이터는 이 기기에 저장됨",cards:"개 카드",activeBoard:"활성 보드",active:"실행 중",paused:"일시 중지",autoCheck:"자동 확인",newCard:"새 카드",checkUpdates:"업데이트 확인",checking:"확인 중…",all:"전체",news:"뉴스",event:"이벤트",analysis:"분석",timeline:"타임라인",source:"출처",note:"메모",searchCards:"카드 검색",updateBatch:"업데이트 묶음",savedImportant:"잠긴 중요 카드",latestUpdate:"최신 업데이트",coreInfo:"핵심 정보",lockImportant:"중요 카드로 지정",unlockImportant:"중요 잠금 해제",changed:"정보 변경",conflict:"정보 충돌",changesTitle:"변경 및 충돌",noChanges:"변경이나 충돌이 없습니다.",markResolved:"처리 완료",language:"화면 및 정보 언어",system:"시스템 언어",maxBatches:"보관할 업데이트 묶음",saveSettings:"설정 저장",testConnection:"연결 테스트",newProject:"새 프로젝트" };

const dictionaries: Record<Exclude<AppLanguage, "system">, Dictionary> = { "zh-CN": zh, en, ru, fr, de, ja, ko };

function resolveLanguage(language: AppLanguage): Exclude<AppLanguage, "system"> {
  if (language !== "system") return language;
  const locale = navigator.language.toLowerCase();
  if (locale.startsWith("zh")) return "zh-CN";
  for (const code of ["ru", "fr", "de", "ja", "ko"] as const) if (locale.startsWith(code)) return code;
  return "en";
}

interface I18nValue { language: AppLanguage; locale: string; setLanguage(value: AppLanguage): void; t(key: Key): string }
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => {
    const saved = window.localStorage.getItem("ai-research-board-language");
    return (["system", "zh-CN", "en", "ru", "fr", "de", "ja", "ko"] as string[]).includes(saved ?? "") ? saved as AppLanguage : "system";
  });
  const resolved = resolveLanguage(language);
  useEffect(() => { document.documentElement.lang = resolved; window.localStorage.setItem("ai-research-board-language", language); }, [language, resolved]);
  const value = useMemo<I18nValue>(() => ({ language, locale: resolved, setLanguage, t: (key) => dictionaries[resolved][key] }), [language, resolved]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// The provider and its hook intentionally share one small module so dictionaries stay lazy and colocated.
// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider is missing");
  return value;
}
