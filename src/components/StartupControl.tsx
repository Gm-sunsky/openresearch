import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import type { StartupSettings } from "../shared/contracts";

export function StartupControl() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<StartupSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    const cancelRequests = () => { request.current++; };
    return cancelRequests;
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (saving.current) return;
      const id = ++request.current;
      void api.startup?.get().then(value => {
        if (id === request.current) { setSettings(value); setError(""); }
      }).catch(reason => { if (id === request.current) setError(reason instanceof Error ? reason.message : t("startupFailed")); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("focus", refresh); };
  }, [t]);

  const toggle = async (enabled: boolean) => {
    const id = ++request.current;
    saving.current = true;
    setBusy(true); setError("");
    try {
      const value = await api.startup.set(enabled);
      if (id === request.current) setSettings(value);
    } catch (reason) {
      if (id === request.current) setError(reason instanceof Error ? reason.message : t("startupFailed"));
    } finally { saving.current = false; if (id === request.current) setBusy(false); }
  };

  return <div className="mt-5 border-t border-black/[0.07] pt-4">
    <label className="setting-toggle">
      <input id="launch-at-login" type="checkbox" checked={Boolean(settings?.enabled || settings?.requiresApproval)} disabled={!settings?.supported || busy} onChange={event => void toggle(event.target.checked)} />
      <span><strong>{t("startupLabel")}</strong><small>{t("startupHint")}</small></span>
    </label>
    <p className="mt-2 text-[9px] leading-4 theme-text-secondary" role="status">{error || (busy ? t("saving") : settings?.requiresApproval ? t("startupApproval") : settings && !settings.supported ? t("startupDesktopOnly") : "")}</p>
    <p className="mt-3 text-[9px] leading-4 theme-text-muted">{t("scheduledUpdatesHint")}</p>
  </div>;
}
