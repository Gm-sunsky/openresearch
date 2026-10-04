import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS } from "../src/shared/contracts";

describe("sandboxed preload", () => {
  it("is self-contained and keeps every IPC channel in sync", () => {
    const source = readFileSync(path.resolve("electron/preload/index.ts"), "utf8");
    expect(source).not.toMatch(/import\s+\{[^}]*IPC_CHANNELS[^}]*\}\s+from\s+["']\.\./);
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(source).toContain(`"${channel}"`);
    }
  });
});
