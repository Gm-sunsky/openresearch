import { useEffect, useRef, useState } from "react";
import type { Project } from "../shared/contracts";
import { DatabaseIcon, PlusIcon, RefreshIcon, SearchIcon, SettingsIcon } from "./Icons";
import { useI18n } from "../i18n";
import { StartupControl } from "./StartupControl";

interface ProjectSidebarProps {
  projects: Project[];
  selectedId: string | null;
  onSelect(projectId: string): void;
  onToggleUpdate(projectId: string, selected: boolean): void;
  updatingIds: Set<string>;
  selectionSaving: boolean;
  onCreate(): void;
  onSettings(): void;
}

export function ProjectSidebar({ projects, selectedId, onSelect, onToggleUpdate, updatingIds, selectionSaving, onCreate, onSettings }: ProjectSidebarProps) {
  const { t, locale } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const searchButton = useRef<HTMLButtonElement>(null);
  const chinese = locale.startsWith("zh");
  const searchTerms = query.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  const visibleProjects = projects.filter((project) => {
    const text = [project.name, project.description, project.goal, ...project.focus].join(" ").toLocaleLowerCase(locale);
    return searchTerms.every((term) => text.includes(term));
  });

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229 || document.querySelector('[aria-modal="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function closeSearch() {
    setQuery("");
    setSearchOpen(false);
    searchButton.current?.focus();
  }
  return (
    <aside className="sidebar project-sidebar flex h-full w-[248px] shrink-0 flex-col">
      <div className="sidebar-brand flex h-[72px] items-center gap-3 px-5">
        <div className="brand-mark brand-ring" aria-hidden="true" />
        <div>
          <p className="text-[13px] font-semibold tracking-[-0.01em] text-white">OpenResearch</p>

        </div>
      </div>

      <div className="px-3 pt-2">
        <button ref={searchButton} className="sidebar-action" type="button" onClick={() => {
          setSearchOpen(true);
          searchInput.current?.focus();
        }} aria-expanded={searchOpen} aria-controls="project-search">
          <SearchIcon className="h-4 w-4" />
          {t("searchProjects")}
          <span className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-white/35">Ctrl / ⌘ K</span>
        </button>
        {searchOpen && <div id="project-search" className="mt-2 flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1">
          <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            aria-label={t("searchProjects")} placeholder={chinese ? "名称、简介、目标或关注项" : "Name, description, goal or focus"}
            className="min-w-0 flex-1 bg-transparent py-1 text-[11px] text-white outline-none placeholder:text-white/40"
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Escape") {
                event.preventDefault();
                closeSearch();
              } else if (event.key === "Enter" && visibleProjects.length > 0) {
                event.preventDefault();
                onSelect(visibleProjects[0].id);
                closeSearch();
              }
            }} />
          {query && <button type="button" className="sidebar-icon-button" aria-label={chinese ? "清空项目搜索" : "Clear project search"}
            onClick={() => { setQuery(""); searchInput.current?.focus(); }}>×</button>}
          <button type="button" className="sidebar-icon-button text-[10px]" aria-label={chinese ? "关闭项目搜索" : "Close project search"} onClick={closeSearch}>Esc</button>
        </div>}
      </div>

      <div className="sidebar-project-heading mt-7 flex items-center justify-between px-5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">{t("projects")} <span className="sidebar-project-count">{projects.length}</span></span>
        <button className="sidebar-icon-button" type="button" onClick={onCreate} aria-label={t("newProject")}>
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-2 px-5 text-[10px] leading-4 text-white/40">{chinese ? "勾选参与更新，点击名称查看" : "Select to update · click to view"}</p>
      <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3" aria-label="信息项目">
        {searchOpen && <p role="status" className="px-2 pb-2 text-[10px] text-white/40">
          {visibleProjects.length === 0
            ? (chinese ? "没有匹配的项目，请尝试其他关键词。" : "No matching projects. Try another search.")
            : (chinese ? `找到 ${visibleProjects.length} 个项目` : `${visibleProjects.length} projects found`)}
        </p>}
        {visibleProjects.map((project) => {
          const selected = project.id === selectedId;
          const updating = updatingIds.has(project.id);
          return (
            <div key={project.id} className={`project-nav-item ${selected ? "selected" : ""}`}>
              <input
                type="checkbox"
                className="project-update-checkbox h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#e15e45] disabled:cursor-wait"
                checked={project.updateSelected === true}
                disabled={selectionSaving}
                onChange={(event) => onToggleUpdate(project.id, event.target.checked)}
                aria-label={`更新项目：${project.name}`}
                title="勾选后参与手动与自动更新"
              />
              <button
                className="project-view-button flex min-w-0 flex-1 items-center gap-2 text-left"
                type="button"
                onClick={() => onSelect(project.id)}
                aria-current={selected ? "page" : undefined}
                aria-label={`查看项目：${project.name}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium">{project.name}</span>
                  <span className="project-nav-description mt-1 block truncate text-[10px] text-white/40">{project.description || (project.cardCount + " " + t("cards"))}</span>
                </span>
                {updating && <span role="status" aria-label={`${project.name}更新中`}><RefreshIcon className="h-3.5 w-3.5 animate-spin text-[#e15e45]" /></span>}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer border-t border-white/[0.07] p-3">
        <button className="sidebar-action" type="button" onClick={onSettings}>
          <SettingsIcon className="h-4 w-4" />
          {t("settings")}
        </button>
        <StartupControl compact />
        <div className="mt-3 flex items-center gap-3 px-2 pb-1 pt-2">
          <DatabaseIcon className="h-4 w-4 shrink-0 theme-text-muted" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-white/75">{t("localWorkspace")}</p>
            <p className="text-[9px] text-white/30">{t("dataOnDevice")}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
