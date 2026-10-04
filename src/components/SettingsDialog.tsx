import { useEffect, useState } from "react";
import { api } from "../api";
import type { AiSettings, ApiProvider, ApiProtocol, SaveAiSettingsInput } from "../shared/contracts";
import { CheckIcon, CloseIcon, KeyIcon, ShieldIcon } from "./Icons";
import { useI18n } from "../i18n";

interface SettingsDialogProps {
  open: boolean;
  settings: AiSettings | null;
  onClose(): void;
  onSaved(settings: AiSettings): void;
}

function inputFrom(settings: AiSettings): SaveAiSettingsInput {
  return {
    provider: settings.provider,
    protocol: settings.protocol,
    baseUrl: settings.baseUrl,
    model: settings.model,
    autoDiscoverSources: settings.autoDiscoverSources,
    autoAddVerifiedSources: settings.autoAddVerifiedSources,
    aiOrganizeContent: settings.aiOrganizeContent,
    language: settings.language,
    maxUpdateBatches: settings.maxUpdateBatches,
  };
}

export function SettingsDialog({ open, settings, onClose, onSaved }: SettingsDialogProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<SaveAiSettingsInput | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | "backup" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (open && settings) {
      setForm(inputFrom(settings));
      setMessage(null);
      setBusy(null);
    }
  }, [open, settings]);

  if (!open || !settings || !form) return null;

  const changeProvider = (provider: ApiProvider) => {
    setForm((current) => current && {
      ...current,
      provider,
      protocol: provider === "openai" ? "responses" : current.protocol,
      baseUrl: provider === "openai" ? "https://api.openai.com/v1" : current.baseUrl,
      model: provider === "openai" && current.provider !== "openai" ? "gpt-5.6-luna" : current.model,
    });
  };

  const save = async () => {
    setBusy("save"); setMessage(null);
    try {
      const saved = await api.settings.save(form);
      onSaved(saved);
      setForm(inputFrom(saved));
      setMessage({ text: "设置已安全保存", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "设置保存失败", error: true });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test"); setMessage(null);
    try {
      const result = await api.settings.test(form);
      setMessage({ text: `${result.message} · ${result.model} · ${result.latencyMs} ms`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "连接测试失败", error: true });
    } finally {
      setBusy(null);
    }
  };

  const clearKey = () => {
    setForm({ ...form, apiKey: "", clearApiKey: true });
    setMessage({ text: "保存后将清除已有密钥", error: false });
  };

  const createBackup = async () => {
    setBusy("backup"); setMessage(null);
    try {
      const result = await api.maintenance.createBackup();
      setMessage({ text: `备份已创建 · ${(result.sizeBytes / 1024).toFixed(0)} KB`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "备份创建失败", error: true });
    } finally {
      setBusy(null);
    }
  };

  const openDataFolder = async () => {
    try {
      await api.maintenance.openDataFolder();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "无法打开数据目录", error: true });
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
        <header className="flex items-start justify-between border-b border-black/[0.07] px-7 py-6">
          <div>
            <div className="flex items-center gap-2 text-[#e15e45]"><KeyIcon className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">AI connection</span></div>
            <h2 id="api-settings-title" className="mt-2 text-[22px] font-semibold tracking-[-0.035em] theme-text-primary">{t("apiAutomation")}</h2>
            <p className="mt-1 text-[12px] theme-text-secondary">连接 AI 服务，让来源发现 Agent 主动寻找并核验信息源。</p>
          </div>
          <button className="dialog-close" type="button" onClick={onClose} aria-label="关闭"><CloseIcon className="h-4 w-4" /></button>
        </header>

        <div className="grid grid-cols-[1fr_250px]">
          <div className="space-y-5 border-r border-black/[0.07] p-7">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="app-language">{t("language")}</label>
                <select id="app-language" className="text-field mt-2" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value as SaveAiSettingsInput["language"] })}>
                  <option value="system">{t("system")}</option><option value="zh-CN">中文</option><option value="en">English</option>
                  <option value="ru">Русский</option><option value="fr">Français</option><option value="de">Deutsch</option>
                  <option value="ja">日本語</option><option value="ko">한국어</option>
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="max-batches">{t("maxBatches")}</label>
                <input id="max-batches" className="text-field mt-2" type="number" min="1" max="200" value={form.maxUpdateBatches} onChange={(event) => setForm({ ...form, maxUpdateBatches: Number(event.target.value) || 20 })} />
                <p className="mt-1.5 text-[8px] leading-4 theme-text-muted">{t("maxBatchesHint")}</p>
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="api-provider">{t("serviceType")}</label>
              <select id="api-provider" className="text-field mt-2" value={form.provider} onChange={(event) => changeProvider(event.target.value as ApiProvider)}>
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">兼容 OpenAI 的服务 / 本地模型</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="api-model">{t("model")}</label>
                <input id="api-model" className="text-field mt-2" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="模型名称" />
              </div>
              <div>
                <label className="field-label" htmlFor="api-protocol">{t("protocol")}</label>
                <select
                  id="api-protocol"
                  className="text-field mt-2"
                  value={form.protocol}
                  disabled={form.provider === "openai"}
                  onChange={(event) => setForm({ ...form, protocol: event.target.value as ApiProtocol })}
                >
                  <option value="responses">Responses API</option>
                  <option value="chat-completions">Chat Completions</option>
                </select>
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="api-base-url">{t("apiAddress")}</label>
              <input id="api-base-url" className="text-field mt-2" value={form.baseUrl} disabled={form.provider === "openai"} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="field-label" htmlFor="api-key">{t("apiKey")}</label>
                {settings.apiKeyConfigured && <button className="text-button" type="button" onClick={clearKey}>清除已保存密钥</button>}
              </div>
              <input
                id="api-key"
                className="text-field mt-2"
                type="password"
                autoComplete="off"
                value={form.apiKey ?? ""}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value, clearApiKey: false })}
                placeholder={settings.apiKeyConfigured ? `已安全保存 ····${settings.apiKeyHint ?? ""}（留空则不变）` : "输入 API 密钥"}
              />
            </div>
          </div>

          <aside className="bg-[#f4f2ed] p-6">
            <div className="security-note">
              <ShieldIcon className="h-4 w-4 theme-text-secondary" />
              <div><strong>密钥留在此设备</strong><p>使用系统安全存储加密，不会发送到界面或写入日志。</p></div>
            </div>
            <p className="field-label mt-7">{t("automation")}</p>
            <label className="setting-toggle mt-3">
              <input type="checkbox" checked={form.autoDiscoverSources} onChange={(event) => setForm({ ...form, autoDiscoverSources: event.target.checked })} />
              <span><strong>创建项目后发现来源</strong><small>自动生成候选列表，仍由你确认。</small></span>
            </label>
            <label className="setting-toggle mt-3">
              <input type="checkbox" checked={form.aiOrganizeContent} onChange={(event) => setForm({ ...form, aiOrganizeContent: event.target.checked })} />
              <span><strong>{t("aiOrganize")}</strong><small>检查更新时判断相关性、分类并生成摘要；失败时自动退回本地规则。</small></span>
            </label>
            <label className="setting-toggle mt-3">
              <input type="checkbox" checked={form.autoAddVerifiedSources} onChange={(event) => setForm({ ...form, autoAddVerifiedSources: event.target.checked })} />
              <span><strong>自动添加高可信来源</strong><small>仅添加已连通且置信度较高的来源。</small></span>
            </label>
            <div className="mt-7 border-t border-black/[0.07] pt-4 text-[10px] leading-5 theme-text-secondary">
              <p className="flex items-center gap-1.5"><CheckIcon className="h-3 w-3 theme-text-secondary" />候选网址经过安全检查</p>
              <p className="mt-1 flex items-center gap-1.5"><CheckIcon className="h-3 w-3 theme-text-secondary" />默认不自动添加来源</p>
            </div>
            <div className="mt-6 border-t border-black/[0.07] pt-4">
              <p className="field-label">本地数据</p>
              <button className="secondary-button mt-3 w-full" type="button" disabled={busy !== null} onClick={() => void createBackup()}>{busy === "backup" ? "备份中…" : "立即创建备份"}</button>
              <button className="mini-button mt-2 w-full" type="button" onClick={() => void openDataFolder()}>打开数据目录</button>
              <p className="mt-2 text-[8px] leading-4 theme-text-muted">软件每天自动保留一份备份，最多保存最近 10 份。</p>
            </div>
          </aside>
        </div>

        <footer className="flex min-h-[67px] items-center justify-between border-t border-black/[0.07] px-7 py-4">
          <p className={`max-w-[400px] text-[10px] ${message?.error ? "text-[#bf4937]" : "theme-text-secondary"}`}>{message?.text ?? "修改密钥时请先测试连接，再保存设置。"}</p>
          <div className="flex gap-2">
            <button className="secondary-button" type="button" disabled={busy !== null} onClick={test}>{busy === "test" ? "测试中…" : t("testConnection")}</button>
            <button className="primary-button" type="button" disabled={busy !== null || !form.model.trim()} onClick={save}>{busy === "save" ? t("saving") : t("saveSettings")}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
