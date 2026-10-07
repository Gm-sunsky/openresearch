import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { INFORMATION_DEPTH_POLICIES, informationDepthPolicy, normalizeInformationDepth } from "../shared/information-depth";
import { frequencyLabel } from "../lib/format";
import type { Project, ProjectDraft } from "../shared/contracts";
import { CloseIcon, SparkIcon } from "./Icons";
import { useI18n } from "../i18n";

interface CreateProjectDialogProps {
  open: boolean;
  onClose(): void;
  onCreated(project: Project): void;
}

const example = `帮我持续关注 Yorushika 的演出信息。\n\n- 日本国内演唱会\n- 海外巡演\n- 官方公告\n- 售票信息\n\n每天检查更新。`;

export function CreateProjectDialog({ open, onClose, onCreated }: CreateProjectDialogProps) {
  const { t, locale } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    requestId.current += 1;
    if (!open) {
      setPrompt(""); setName(""); setDraft(null); setError(null); setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const analyze = async () => {
    if (!prompt.trim()) return;
    const request = ++requestId.current;
    setBusy(true); setError(null);
    try {
      const preview = await api.projects.preview({ prompt, name: name || undefined });
      if (request !== requestId.current) return;
      setDraft({ ...preview, informationDepth: normalizeInformationDepth(preview.informationDepth) });
      setName(preview.name);
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : "暂时无法分析需求");
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  const create = async () => {
    const request = ++requestId.current;
    setBusy(true); setError(null);
    try {
      const project = await api.projects.create({ prompt, name: name || draft?.name, draft: draft ? { ...draft, name: name || draft.name } : undefined });
      if (request !== requestId.current) return;
      onCreated(project);
      onClose();
    } catch (reason) {
      if (request === requestId.current) setError(reason instanceof Error ? reason.message : "项目创建失败");
    } finally {
      if (request === requestId.current) setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="create-dialog" role="dialog" aria-modal="true" aria-labelledby="create-project-title">
        <header className="flex items-start justify-between border-b border-black/[0.07] px-7 py-6">
          <div>
            <div className="flex items-center gap-2 text-[#e15e45]"><SparkIcon className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Project agent</span></div>
            <h2 id="create-project-title" className="mt-2 text-[22px] font-semibold tracking-[-0.035em] theme-text-primary">{t("createProject")}</h2>
            <p className="mt-1 text-[12px] theme-text-secondary">{t("createProjectHint")}</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭"><CloseIcon className="h-4 w-4" /></button>
        </header>

        <div className="grid min-h-[390px] grid-cols-[1.08fr_0.92fr]">
          <div className="border-r border-black/[0.07] p-7">
            <label className="field-label" htmlFor="project-prompt">{t("monitoringQuestion")}</label>
            <textarea
              id="project-prompt"
              className="prompt-area mt-3"
              value={prompt}
              onChange={(event) => { requestId.current += 1; setPrompt(event.target.value); setDraft(null); setBusy(false); }}
              placeholder={example}
              autoFocus
            />
            <button className="text-button mt-3" type="button" onClick={() => { requestId.current += 1; setPrompt(example); setDraft(null); setBusy(false); }}>{t("useExample")}</button>
            {error && <p className="mt-4 text-[11px] text-[#bf4937]">{error}</p>}
          </div>

          <div className="bg-[#f4f2ed] p-7">
            <p className="field-label">{t("projectPreview")}</p>
            {draft ? (
              <div className="mt-4 animate-fade-in">
                <label className="field-label" htmlFor="project-name">{t("projectName")}</label>
                <input id="project-name" className="text-field mt-2" value={name} onChange={(event) => setName(event.target.value)} />
                <div className="mt-6">
                  <p className="preview-label">{t("monitoringGoal")}</p>
                  <p className="mt-1.5 text-[12px] leading-5 theme-text-primary">{draft.goal}</p>
                </div>
                <div className="mt-5">
                  <p className="preview-label">{t("focusScope")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {draft.focus.map((item) => <span className="focus-tag" key={item}>{item}</span>)}
                  </div>
                </div>
                <div className="mt-5">
                  <label className="field-label" htmlFor="project-depth">信息层级</label>
                  <select id="project-depth" className="text-field mt-2" value={draft.informationDepth} aria-describedby="project-depth-hint" onChange={(event) => setDraft({ ...draft, informationDepth: normalizeInformationDepth(event.target.value) })}>
                    {Object.entries(INFORMATION_DEPTH_POLICIES).map(([value, policy]) => <option key={value} value={value}>{policy.label}</option>)}
                  </select>
                  <p id="project-depth-hint" className="mt-2 text-[10px] leading-5 theme-text-secondary">{informationDepthPolicy(draft.informationDepth).guidance}</p>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-black/[0.07] pt-4">
                  <span className="preview-label">自动检查</span>
                  <span className="text-[11px] font-medium theme-text-primary">{frequencyLabel(draft.updateFrequency, locale)}</span>
                </div>
              </div>
            ) : (
              <div className="flex h-[310px] flex-col items-center justify-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white theme-text-muted"><SparkIcon className="h-4 w-4" /></div>
                <p className="mt-4 text-[12px] font-medium theme-text-secondary">{t("waitingAnalysis")}</p>
                <p className="mt-1 max-w-[210px] text-[10px] leading-5 theme-text-muted">{t("waitingAnalysisHint")}</p>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-black/[0.07] px-7 py-4">
          <span className="text-[10px] theme-text-muted">{t("noApiNeeded")}</span>
          <div className="flex gap-2">
            <button className="secondary-button" type="button" onClick={onClose}>{t("cancel")}</button>
            {draft ? (
              <button className="primary-button" type="button" disabled={busy || !name.trim()} onClick={create}>{busy ? t("creating") : t("create")}</button>
            ) : (
              <button className="primary-button" type="button" disabled={busy || !prompt.trim()} onClick={analyze}><SparkIcon className="h-3.5 w-3.5" />{busy ? t("analyzing") : t("analyze")}</button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
