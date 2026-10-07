import { useEffect, useRef } from "react";
import { useI18n } from "../i18n";

interface ConfirmDialogProps {
  message: string | null;
  onResolve(confirmed: boolean): void;
}

export function ConfirmDialog({ message, onResolve }: ConfirmDialogProps) {
  const { t } = useI18n();
  const cancel = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (message === null) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancel.current?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [message]);
  if (message === null) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) onResolve(false);
  }}>
    <section ref={dialog} className="create-dialog p-7" style={{ maxWidth: 460 }} role="alertdialog" aria-modal="true" aria-describedby="confirm-dialog-message" aria-label={t("confirmationTitle")} onKeyDown={event => {
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") { event.preventDefault(); onResolve(false); }
      if (event.key === "Tab") {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <p id="confirm-dialog-message" className="theme-text-primary text-[13px] leading-6">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button ref={cancel} className="secondary-button" type="button" onClick={() => onResolve(false)}>{t("cancel")}</button>
        <button className="primary-button" type="button" onClick={() => onResolve(true)}>{t("confirmDeletion")}</button>
      </div>
    </section>
  </div>;
}
