import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ApiSettingsService, type SecretProtector } from "../electron/main/api-settings";
import { ResearchDatabase } from "../electron/main/database";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

async function createService() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "research-board-settings-"));
  temporaryDirectories.push(directory);
  const database = await ResearchDatabase.open(
    path.join(directory, "test.sqlite"),
    path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"),
  );
  const protector: SecretProtector = {
    available: () => true,
    encrypt: (value) => Buffer.from(`protected:${value}`).toString("base64"),
    decrypt: (value) => Buffer.from(value, "base64").toString().replace(/^protected:/, ""),
  };
  return { database, service: new ApiSettingsService(database, protector) };
}

describe("ApiSettingsService", () => {
  it("stores a protected key and never returns it to the renderer settings", async () => {
    const { database, service } = await createService();
    const publicSettings = service.save({
      provider: "openai",
      protocol: "responses",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
      apiKey: "sk-secret-value",
      autoDiscoverSources: true,
      autoAddVerifiedSources: false,
      language: "system",
      maxUpdateBatches: 20,
    });

    expect(publicSettings.apiKeyConfigured).toBe(true);
    expect(publicSettings.apiKeyHint).toBe("alue");
    expect(JSON.stringify(publicSettings)).not.toContain("sk-secret-value");
    expect(service.resolve().apiKey).toBe("sk-secret-value");
    expect(database.getSetting<{ encryptedApiKey: string }>("ai.provider")?.encryptedApiKey).not.toContain("sk-secret-value");
    database.close();
  });

  it("keeps the saved key when an empty key is submitted and can clear it explicitly", async () => {
    const { database, service } = await createService();
    const base = {
      provider: "openai" as const,
      protocol: "responses" as const,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-luna",
      autoDiscoverSources: true,
      autoAddVerifiedSources: false,
      language: "system" as const,
      maxUpdateBatches: 20,
    };
    service.save({ ...base, apiKey: "sk-once" });
    service.save({ ...base, apiKey: "" });
    expect(service.resolve().apiKey).toBe("sk-once");
    expect(service.save({ ...base, clearApiKey: true }).apiKeyConfigured).toBe(false);
    database.close();
  });
});
