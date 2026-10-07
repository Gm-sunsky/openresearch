// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ConfirmDialog } from "../src/components/ConfirmDialog";
import { useConfirmation } from "../src/lib/use-confirmation";
import { I18nProvider } from "../src/i18n";

it("cancels without native modal dialogs and restores editable input focus", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  let result: boolean | undefined;
  function Fixture() {
    const confirmation = useConfirmation();
    const [value, setValue] = useState("draft");
    return createElement(I18nProvider, null,
      createElement("input", { value, onChange: (event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value) }),
      createElement("button", { onClick: async () => { result = await confirmation.confirm("Delete?"); } }, "request"),
      createElement(ConfirmDialog, { message: confirmation.message, onResolve: confirmation.onResolve }));
  }
  try {
    await act(async () => root.render(createElement(Fixture)));
    const input = container.querySelector("input")!; input.focus();
    await act(async () => container.querySelector("button")!.click());
    const modal = container.querySelector('[role="alertdialog"]')!;
    expect(modal).not.toBeNull();
    await act(async () => modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(result).toBe(false);
    expect(document.activeElement).toBe(input);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "continued typing");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(input.value).toBe("continued typing");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
