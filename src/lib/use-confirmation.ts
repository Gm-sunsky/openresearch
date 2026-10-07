import { useCallback, useEffect, useRef, useState } from "react";

/** Render ConfirmDialog with message/onResolve; await confirm(message) before deleting. */
export function useConfirmation() {
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  const confirm = useCallback((text: string) => new Promise<boolean>(resolve => {
    pending.current?.(false);
    pending.current = resolve;
    setMessage(text);
  }), []);
  const onResolve = useCallback((confirmed: boolean) => {
    pending.current?.(confirmed);
    pending.current = null;
    setMessage(null);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  return { confirm, message, onResolve };
}
