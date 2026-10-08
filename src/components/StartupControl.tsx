import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import type { StartupSettings } from "../shared/contracts";

export function StartupControl({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<StartupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTarget, setSavingTarget] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0), saving = useRef(false);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const translate = useRef(t);
  translate.current = t;
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    const refresh = (event?: Event) => {
      if (event instanceof CustomEvent && event.detail?.source === request) return;
      if (saving.current) return;
      const id = ++request.current;
      setLoading(true);
      void (async () => {
        try {
          if (!api.startup) throw new Error(translate.current("startupReadFailed"));
          const value = await api.startup.get();
          if (id === request.current) { setSettings(value); setError(""); }
        } catch (reason) {
          if (id === request.current) {
            setSettings(null);
            setError(reason instanceof Error ? reason.message : translate.current("startupReadFailed"));
          }
        } finally { if (id === request.current) setLoading(false); }
      })();
    };
    refreshRef.current = refresh;
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("openresearch-startup-changed", refresh);
    const invalidate = () => { request.current++; };
    return () => {
      invalidate();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("openresearch-startup-changed", refresh);
    };
  }, []);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = Boolean(settings?.requiresApproval);
  }, [settings]);
  const toggle = async (enabled: boolean) => {
    const id = ++request.current;
    saving.current = true;
    setSavingTarget(enabled); setError("");
    try {
      const value = await api.startup.set(enabled);
      if (id === request.current) setSettings(value);
    } catch (reason) {
      let message = reason instanceof Error ? reason.message : translate.current("startupFailed");
      try {
        const value = await api.startup.get();
        if (id === request.current) setSettings(value);
      } catch {
        if (id === request.current) setSettings(null);
        message += " " + translate.current("startupStateUnknown");
      }
      if (id === request.current) setError(message);
    } finally {
      saving.current = false;
      if (id === request.current) {
        setSavingTarget(null);
      }
      window.dispatchEvent(new CustomEvent("openresearch-startup-changed", { detail: { source: request } }));
    }
  };
  const unavailable = settings?.unavailableReason;
  const status = savingTarget !== null ? t(savingTarget ? "startupEnabling" : "startupDisabling")
    : loading ? t("startupLoading")
    : settings?.requiresApproval ? t("startupApproval")
    : settings && !settings.supported ? t(unavailable === "build" ? "startupBuildRequired" : unavailable === "development" ? "startupInstallRequired" : "startupDesktopOnly")
    : settings ? t(settings.enabled ? "startupEnabled" : "startupDisabled") : t("startupReadFailed");
  return <div className={compact ? "startup-control sidebar-startup" : "startup-control mt-5 border-t border-black/[0.07] pt-4"}>
    <label className="setting-toggle">
      <input ref={checkboxRef} id={compact ? "sidebar-launch-at-login" : "launch-at-login"} type="checkbox" checked={Boolean(settings?.enabled && !settings.requiresApproval)} aria-checked={settings?.requiresApproval ? "mixed" : Boolean(settings?.enabled)} disabled={!settings?.supported || loading || savingTarget !== null || Boolean(error)} onChange={event => void toggle(settings?.requiresApproval ? false : event.target.checked)} />
      <span><strong>{t("startupLabel")}</strong>{!compact && <small>{t("startupHint")}</small>}</span>
    </label>
    <p className="mt-2 text-[9px] leading-4 theme-text-secondary" role="status">{status}</p>
    {error && <p className="mt-1 text-[9px] leading-4 theme-text-secondary" role="alert">{error} <button type="button" className="underline" disabled={loading || savingTarget !== null} onClick={() => refreshRef.current()}>{t("startupRetry")}</button></p>}
    {!compact && <p className="mt-3 text-[9px] leading-4 theme-text-muted">{t("scheduledUpdatesHint")}</p>}
  </div>;
}
