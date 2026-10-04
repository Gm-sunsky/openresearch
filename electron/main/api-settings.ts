import type { AiSettings, ApiProtocol, ApiProvider, AppLanguage, SaveAiSettingsInput } from "../../src/shared/contracts";
import { ResearchDatabase } from "./database";

const SETTINGS_KEY = "ai.provider";

interface StoredAiSettings {
  provider: ApiProvider;
  protocol: ApiProtocol;
  baseUrl: string;
  model: string;
  encryptedApiKey: string | null;
  apiKeyHint: string | null;
  autoDiscoverSources: boolean;
  autoAddVerifiedSources: boolean;
  aiOrganizeContent: boolean;
  language: AppLanguage;
  maxUpdateBatches: number;
  updatedAt: string | null;
}

export interface RuntimeAiSettings extends Omit<AiSettings, "apiKeyConfigured" | "apiKeyHint"> {
  apiKey: string | null;
}

export interface SecretProtector {
  available(): boolean;
  encrypt(value: string): string;
  decrypt(value: string): string;
}

const DEFAULT_SETTINGS: StoredAiSettings = {
  provider: "openai",
  protocol: "responses",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-5.6-luna",
  encryptedApiKey: null,
  apiKeyHint: null,
  autoDiscoverSources: true,
  autoAddVerifiedSources: false,
  aiOrganizeContent: true,
  language: "system",
  maxUpdateBatches: 20,
  updatedAt: null,
};

function normalizeBaseUrl(value: string): string {
  const raw = value.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API 地址无效");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("远程 API 必须使用 HTTPS；本地模型可使用 localhost HTTP");
  }
  if (url.username || url.password) throw new Error("API 地址不能包含账号或密码");
  return url.toString().replace(/\/+$/, "");
}

function normalizePublicSettings(stored: StoredAiSettings): AiSettings {
  return {
    provider: stored.provider,
    protocol: stored.provider === "openai" ? "responses" : stored.protocol,
    baseUrl: stored.baseUrl,
    model: stored.model,
    apiKeyConfigured: Boolean(stored.encryptedApiKey),
    apiKeyHint: stored.apiKeyHint,
    autoDiscoverSources: stored.autoDiscoverSources,
    autoAddVerifiedSources: stored.autoAddVerifiedSources,
    aiOrganizeContent: stored.aiOrganizeContent,
    language: stored.language,
    maxUpdateBatches: stored.maxUpdateBatches,
    updatedAt: stored.updatedAt,
  };
}

export class ApiSettingsService {
  constructor(
    private readonly database: ResearchDatabase,
    private readonly protector: SecretProtector,
  ) {}

  get(): AiSettings {
    return normalizePublicSettings(this.readStored());
  }

  save(input: SaveAiSettingsInput): AiSettings {
    const current = this.readStored();
    const apiKey = input.apiKey?.trim();
    let encryptedApiKey = current.encryptedApiKey;
    let apiKeyHint = current.apiKeyHint;

    if (input.clearApiKey) {
      encryptedApiKey = null;
      apiKeyHint = null;
    } else if (apiKey) {
      if (!this.protector.available()) throw new Error("系统安全存储当前不可用，无法保存 API 密钥");
      encryptedApiKey = this.protector.encrypt(apiKey);
      apiKeyHint = apiKey.length > 4 ? apiKey.slice(-4) : apiKey;
    }

    const stored: StoredAiSettings = {
      provider: input.provider,
      protocol: input.provider === "openai" ? "responses" : input.protocol,
      baseUrl: normalizeBaseUrl(input.provider === "openai" ? "https://api.openai.com/v1" : input.baseUrl),
      model: input.model.trim().slice(0, 120),
      encryptedApiKey,
      apiKeyHint,
      autoDiscoverSources: input.autoDiscoverSources,
      autoAddVerifiedSources: input.autoAddVerifiedSources,
      aiOrganizeContent: input.aiOrganizeContent !== false,
      language: input.language,
      maxUpdateBatches: Math.max(1, Math.min(200, Math.round(input.maxUpdateBatches || 20))),
      updatedAt: new Date().toISOString(),
    };
    if (!stored.model) throw new Error("模型名称不能为空");
    this.database.setSetting(SETTINGS_KEY, stored);
    return normalizePublicSettings(stored);
  }

  resolve(input?: SaveAiSettingsInput): RuntimeAiSettings {
    if (input) {
      const stored = this.readStored();
      const publicSettings: AiSettings = {
        provider: input.provider,
        protocol: input.provider === "openai" ? "responses" : input.protocol,
        baseUrl: normalizeBaseUrl(input.provider === "openai" ? "https://api.openai.com/v1" : input.baseUrl),
        model: input.model.trim(),
        apiKeyConfigured: Boolean(input.apiKey?.trim() || (!input.clearApiKey && stored.encryptedApiKey)),
        apiKeyHint: null,
        autoDiscoverSources: input.autoDiscoverSources,
        autoAddVerifiedSources: input.autoAddVerifiedSources,
        aiOrganizeContent: input.aiOrganizeContent !== false,
        language: input.language,
        maxUpdateBatches: Math.max(1, Math.min(200, Math.round(input.maxUpdateBatches || 20))),
        updatedAt: stored.updatedAt,
      };
      return {
        ...publicSettings,
        apiKey: input.apiKey?.trim() || (input.clearApiKey ? null : this.decryptKey(stored)),
      };
    }

    const stored = this.readStored();
    const publicSettings = normalizePublicSettings(stored);
    return { ...publicSettings, apiKey: this.decryptKey(stored) };
  }

  private readStored(): StoredAiSettings {
    const saved = this.database.getSetting<Partial<StoredAiSettings>>(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  private decryptKey(stored: StoredAiSettings): string | null {
    if (!stored.encryptedApiKey) return null;
    if (!this.protector.available()) throw new Error("系统安全存储当前不可用，无法读取 API 密钥");
    try {
      return this.protector.decrypt(stored.encryptedApiKey);
    } catch {
      throw new Error("API 密钥无法解密，请在设置中重新保存");
    }
  }
}
