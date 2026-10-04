import { useEffect, useState } from "react";
import type { Project, UpdateProjectInput } from "../shared/contracts";
import { INFORMATION_DEPTH_POLICIES, informationDepthPolicy, normalizeInformationDepth } from "../shared/information-depth";
import { CloseIcon, TrashIcon } from "./Icons";
import { useI18n } from "../i18n";

interface ProjectSettingsDialogProps {
  open: boolean;
  project: Project | null;
  onClose(): void;
  onSave(input: UpdateProjectInput): Promise<void>;
  onDelete(): Promise<void>;
}

export function ProjectSettingsDialog({ open, project, onClose, onSave, onDelete }: ProjectSettingsDialogProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<UpdateProjectInput | null>(null);
  const [focusText, setFocusText] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !project) return;
    setForm({
      id: project.id,
      name: project.name,
      description: project.description,
      goal: project.goal,
      focus: project.focus,
      updateFrequency: project.updateFrequency,
      informationDepth: normalizeInformationDepth(project.informationDepth),
      status: project.status,
    });
    setFocusText(project.focus.join("\n"));
    setError(null);
  }, [open, project]);

  if (!open || !form) return null;

  const save = async () => {
    const focus = focusText.split(/\r?\n|[,，]/).map((item) => item.trim()).filter(Boolean);
    if (!form.name.trim() || !form.goal.trim() || !focus.length) {
      setError("项目名称、目标和至少一个关注项不能为空");
      return;
    }
    setBusy(true); setError(null);
    try {
      await onSave({ ...form, focus });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "项目设置保存失败");
    } finally {
      setBusy(false);
    }
  };

  const removeProject = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog max-w-[680px]" role="dialog" aria-modal="true" aria-labelledby="project-settings-title">
        <header className="flex items-start justify-between border-b border-black/[0.07] px-7 py-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e15e45]">Project settings</p>
            <h2 id="project-settings-title" className="mt-2 text-[22px] font-semibold tracking-[-0.035em] text-[#22231f]">{t("projectAgentSettings")}</h2>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭"><CloseIcon className="h-4 w-4" /></button>
        </header>
        <div className="grid grid-cols-2 gap-5 p-7">
          <div>
            <label className="field-label" htmlFor="edit-project-name">{t("projectName")}</label>
            <input id="edit-project-name" className="text-field mt-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="edit-project-frequency">{t("checkFrequency")}</label>
            <select id="edit-project-frequency" className="text-field mt-2" value={form.updateFrequency} onChange={(event) => setForm({ ...form, updateFrequency: event.target.value as UpdateProjectInput["updateFrequency"] })}>
              <option value="hourly">每小时</option><option value="daily">每天</option><option value="weekly">每周</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="field-label" htmlFor="edit-project-depth">信息层级</label>
            <select id="edit-project-depth" className="text-field mt-2" value={form.informationDepth} aria-describedby="edit-project-depth-hint" onChange={(event) => setForm({ ...form, informationDepth: normalizeInformationDepth(event.target.value) })}>
              {Object.entries(INFORMATION_DEPTH_POLICIES).map(([value, policy]) => <option key={value} value={value}>{policy.label}</option>)}
            </select>
            <p id="edit-project-depth-hint" className="mt-2 text-[10px] leading-5 text-[#85837c]">{informationDepthPolicy(form.informationDepth).guidance}</p>
          </div>
          <div className="col-span-2">
            <label className="field-label" htmlFor="edit-project-description">{t("description")}</label>
            <input id="edit-project-description" className="text-field mt-2" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="field-label" htmlFor="edit-project-goal">{t("monitoringGoal")}</label>
            <textarea id="edit-project-goal" className="compact-area mt-2" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="field-label" htmlFor="edit-project-focus">{t("focusPerLine")}</label>
            <textarea id="edit-project-focus" className="compact-area mt-2" value={focusText} onChange={(event) => setFocusText(event.target.value)} />
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-black/[0.07] px-7 py-4">
          <button className="danger-link" type="button" disabled={busy || deleting} onClick={() => void removeProject()} title={t("deleteProjectHint")}><TrashIcon className="h-3.5 w-3.5" />{deleting ? t("deletingProject") : t("deleteProject")}</button>
          <p className="ml-4 text-[10px] text-[#bf4937]">{error}</p>
          <div className="ml-auto flex gap-2">
            <button className="secondary-button" type="button" disabled={deleting} onClick={onClose}>{t("cancel")}</button>
            <button className="primary-button" type="button" disabled={busy || deleting} onClick={() => void save()}>{busy ? t("saving") : t("saveSettings")}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
