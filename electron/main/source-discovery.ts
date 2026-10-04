import type {
  AcceptSourceCandidatesResult,
  Project,
  SourceCandidate,
  SourceDiscoveryResult,
  SourcePlatform,
  SourceType,
} from "../../src/shared/contracts";
import { inferSourcePlatform, normalizeSourcePlatform, recommendedSourceType } from "../../src/shared/source-platform";
import { parseFeed } from "./feed-service";
import { AiApiClient } from "./ai-client";
import { ApiSettingsService } from "./api-settings";
import { ResearchDatabase } from "./database";
import { assertPublicSourceUrl, fetchPublicUrl, normalizeDiscoveredUrl } from "./outbound-url";
import { buildDiscoveryQueries, buildResearchWorkflow } from "./research-workflow";

import { mapConcurrent } from "./concurrency";

interface CandidateDraft {
  type: SourceType;
  platform: SourcePlatform;
  name: string;
  url: string;
  rationale: string;
  confidence: number;
  verified: boolean;
  discoveredBy: SourceCandidate["discoveredBy"];
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1]?.trim() ?? null;
}

export function discoverFeedLinks(html: string, pageUrl: string): CandidateDraft[] {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  const candidates: CandidateDraft[] = [];
  for (const tag of tags) {
    const rel = attribute(tag, "rel")?.toLowerCase() ?? "";
    const type = attribute(tag, "type")?.toLowerCase() ?? "";
    const href = attribute(tag, "href");
    if (!href || !rel.split(/\s+/).includes("alternate") || !/(rss|atom|feed\+json)/.test(type)) continue;
    try {
      const url = normalizeDiscoveredUrl(new URL(href, pageUrl).toString());
      candidates.push({
        type: "rss",
        platform: "rss",
        name: attribute(tag, "title") || `${new URL(pageUrl).hostname} Feed`,
        url,
        rationale: "网页声明的官方 RSS/Atom 订阅地址",
        confidence: 0.95,
        verified: true,
        discoveredBy: "page",
      });
    } catch {
      // Ignore malformed or private feed links from remote HTML.
    }
  }
  return candidates;
}

const candidateCollectionKeys = ["sources", "sourceCandidates", "source_candidates", "candidates", "results", "items", "data"];

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function candidateUrl(record: Record<string, unknown>): string | null {
  return firstString(record, ["url", "link", "source_url", "sourceUrl", "href"]);
}

function candidateItems(value: unknown, depth = 0): unknown[] | null {
  if (depth > 3) return null;
  if (Array.isArray(value)) {
    if (!value.length) return value;
    return value.some((item) => item && typeof item === "object" && candidateUrl(item as Record<string, unknown>))
      ? value
      : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  if (candidateUrl(record)) return [record];
  for (const key of candidateCollectionKeys) {
    if (!(key in record)) continue;
    const nested = candidateItems(record[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function balancedJsonFragments(text: string): string[] {
  const fragments: string[] = [];
  let start = -1;
  let stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start < 0) {
      if (character === "{" || character === "[") {
        start = index;
        stack = [character === "{" ? "}" : "]"];
      }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      stack.push(character === "{" ? "}" : "]");
      continue;
    }
    if (character === "}" || character === "]") {
      if (stack.at(-1) !== character) {
        start = -1;
        stack = [];
        continue;
      }
      stack.pop();
      if (!stack.length) {
        fragments.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return fragments;
}

function parseCandidateItems(text: string): unknown[] {
  const trimmed = text.trim();
  const attempts = [trimmed];
  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) attempts.push(match[1].trim());
  attempts.push(...balancedJsonFragments(trimmed));

  for (const attempt of [...new Set(attempts)].filter(Boolean)) {
    try {
      const items = candidateItems(JSON.parse(attempt));
      if (items) return items;
    } catch {
      // Continue until a complete JSON value containing source candidates is found.
    }
  }
  throw new Error("AI 返回内容没有可识别的 JSON 来源数据");
}

function normalizeCandidateType(value: unknown, url: string): SourceType {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (["rss", "atom", "feed", "xml"].includes(type) || /(?:rss|atom|feed)(?:\.|\/|$)/i.test(url)) return "rss";
  if (["search", "social", "account", "channel", "profile"].includes(type)) return "search";
  return "web";
}

function normalizeConfidence(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" ? Number.parseFloat(value.replace("%", "")) : Number.NaN;
  if (!Number.isFinite(parsed)) return 0.55;
  const normalized = parsed > 1 ? parsed / 100 : parsed;
  return Math.max(0, Math.min(1, normalized));
}

export function parseCandidatePayload(text: string): CandidateDraft[] {
  const parsed = parseCandidateItems(text);

  const candidates: CandidateDraft[] = [];
  for (const item of parsed.slice(0, 18)) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rawUrl = candidateUrl(record);
    if (!rawUrl) continue;
    try {
      const url = normalizeDiscoveredUrl(rawUrl);
      const name = firstString(record, ["name", "title", "source_name", "sourceName"])
        ?? new URL(url).hostname.replace(/^www\./, "");
      const declaredType = normalizeCandidateType(record.type ?? record.source_type ?? record.kind, url);
      const platform = normalizeSourcePlatform(record.platform ?? record.channel_type ?? record.media, url, declaredType);
      candidates.push({
        type: recommendedSourceType(platform, url, declaredType),
        platform,
        name: name.slice(0, 120),
        url,
        rationale: firstString(record, ["rationale", "reason", "relevance", "description", "why"])?.slice(0, 500)
          ?? "AI 推荐的相关来源",
        confidence: normalizeConfidence(record.confidence ?? record.score),
        verified: false,
        discoveredBy: "ai",
      });
    } catch {
      // Remote model output is untrusted; invalid URLs are dropped.
    }
  }
  if (parsed.length && !candidates.length) throw new Error("AI 返回的来源字段不完整或网址无效");
  return candidates.filter((candidate) => candidate.name && candidate.url);
}

function deduplicate(candidates: CandidateDraft[], existingUrls: Set<string>): CandidateDraft[] {
  const unique = new Map<string, CandidateDraft>();
  for (const candidate of candidates) {
    if (existingUrls.has(candidate.url)) continue;
    const current = unique.get(candidate.url);
    if (!current || candidate.confidence > current.confidence) unique.set(candidate.url, candidate);
  }
  return [...unique.values()].slice(0, 14);
}

export class SourceDiscoveryAgent {
  private readonly running = new Map<string, Promise<SourceDiscoveryResult>>();
  constructor(
    private readonly database: ResearchDatabase,
    private readonly ai: AiApiClient,
    private readonly settings: ApiSettingsService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  list(projectId: string): SourceCandidate[] {
    return this.database.listSourceCandidates(projectId);
  }

  async run(projectId: string): Promise<SourceDiscoveryResult> {
    const pending = this.running.get(projectId);
    if (pending) return pending;
    const project = this.requireProject(projectId);
    const runId = this.database.startTaskRun(projectId, "discovery");
    const task = this.executeDiscovery(project, runId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "来源发现发生未知错误";
      this.database.finishTaskRun(runId, { status: "failed", errors: [message], summary: "来源发现失败，原有候选已保留" });
      throw error;
    }).finally(() => this.running.delete(projectId));
    this.running.set(projectId, task);
    return task;
  }

  private async executeDiscovery(project: Project, runId: string): Promise<SourceDiscoveryResult> {
    const projectId = project.id;
    const existingSources = this.database.listSources(projectId);
    const existingUrls = new Set(existingSources.map((source) => {
      try { return normalizeDiscoveredUrl(source.url); } catch { return source.url; }
    }));
    const warnings: string[] = [];
    const pageCandidatesTask = this.fromExistingPages(existingSources.filter((source) => source.type === "web"), warnings);
    let aiCandidates: CandidateDraft[] = [];
    let searchCandidates: CandidateDraft[] = [];
    let usedWebSearch = false;

    if (this.ai.isConfigured()) {
      try {
        const result = await this.ai.discoverSources(project);
        usedWebSearch = result.usedWebSearch;
        if (result.recoveryMode === "continued") warnings.push("首次搜索只返回了过程信息，已自动续写最终来源");
        if (result.recoveryMode === "retried") warnings.push("首次搜索返回为空，已自动重试并恢复来源");
        if (result.recoveryMode === "tool-sources") warnings.push("AI 未生成最终文字，已直接从网页搜索结果恢复来源");
        try {
          aiCandidates = parseCandidatePayload(result.text);
        } catch {
          const repaired = await this.ai.repairSourceCandidateFormat(project, result.text);
          aiCandidates = parseCandidatePayload(repaired);
          warnings.push("AI 返回格式不规范，已自动修复后继续处理");
        }
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : "AI 来源发现失败");
      }
    } else {
      warnings.push("尚未配置 AI API，已改用公开网页搜索和现有页面订阅链接");
    }

    if (aiCandidates.length === 0) {
      searchCandidates = await this.fromPublicSearch(project, warnings);
    }

    const pageCandidates = await pageCandidatesTask;
    const merged = deduplicate([...pageCandidates, ...aiCandidates, ...searchCandidates], existingUrls);
    const verified = await mapConcurrent(merged, 4, async (candidate) => {
      if (candidate.verified) return candidate;
      return { ...candidate, verified: await this.probe(candidate) };
    });
    let candidates = this.database.upsertSourceCandidates(projectId, verified);
    let automaticallyAdded = 0;

    if (this.settings.get().autoAddVerifiedSources) {
      const automatic = candidates.filter((candidate) => candidate.verified && candidate.confidence >= 0.8);
      if (automatic.length) {
        const result = await this.accept(projectId, automatic.map((candidate) => candidate.id));
        automaticallyAdded = result.added.length;
        candidates = this.database.listSourceCandidates(projectId);
      }
    }

    const mode = usedWebSearch ? "ai-web" : aiCandidates.length ? "ai" : searchCandidates.length ? "search" : pageCandidates.length ? "page" : "offline";
    const status = merged.length ? (warnings.length ? "partial" : "completed") : warnings.length ? "failed" : "completed";
    this.database.finishTaskRun(runId, {
      status,
      warnings,
      summary: merged.length ? `发现 ${merged.length} 个新候选来源` : "没有发现新的候选来源",
    });
    return {
      runId,
      projectId,
      mode,
      candidates,
      automaticallyAdded,
      warnings,
    };
  }

  private async fromPublicSearch(project: Project, warnings: string[]): Promise<CandidateDraft[]> {
    const queries = buildDiscoveryQueries(project);
    const workflow = buildResearchWorkflow(project);
    const relevanceTerms = [project.name, ...workflow.entities, ...workflow.tasks]
      .map((value) => value.trim().toLocaleLowerCase())
      .filter((value) => value.length >= 2);
    const results = await mapConcurrent([...new Set(queries)].slice(0, Math.max(12, workflow.entities.length)), 4, async (query) => {
      const candidates: CandidateDraft[] = [];
      try {
        const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
        const response = await fetchPublicUrl(url, {
          signal: AbortSignal.timeout(15_000),
          headers: { accept: "application/rss+xml, application/xml, text/xml" },
        }, this.fetchImpl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = parseFeed(await response.text()).slice(0, 8);
        for (const item of items) {
          let normalized: string;
          try { normalized = normalizeDiscoveredUrl(item.link); } catch { continue; }
          const searchable = `${item.title} ${item.summary}`.toLowerCase();
          const focusMatch = relevanceTerms.some((value) => searchable.includes(value));
          if (!focusMatch) continue;
          const platform = inferSourcePlatform(normalized);
          candidates.push({
            type: recommendedSourceType(platform, normalized),
            platform,
            name: item.title.slice(0, 120),
            url: normalized,
            rationale: `公开搜索结果与“${project.name}”的监控目标直接相关，建议确认来源权威性后添加`,
            confidence: /gov\.cn|\.gov\.|官方|authority|official/i.test(`${normalized} ${item.title}`) ? 0.78 : 0.58,
            verified: false,
            discoveredBy: "search",
          });
        }
        return { candidates, warning: null };
      } catch (error) {
        return { candidates, warning: `公开搜索暂不可用：${error instanceof Error ? error.message : "未知错误"}` };
      }
    });
    warnings.push(...results.flatMap((result) => result.warning ? [result.warning] : []));
    const candidates = results.flatMap((result) => result.candidates);
    if (results.some((result) => !result.warning) && candidates.length === 0) warnings.push("公开搜索完成，但没有找到与项目目标足够相关的新来源");
    return candidates;
  }

  async accept(projectId: string, candidateIds: string[]): Promise<AcceptSourceCandidatesResult> {
    const project = this.requireProject(projectId);
    const candidates = this.database.getSourceCandidates(projectId, [...new Set(candidateIds)].slice(0, 20));
    const existingUrls = new Set(this.database.listSources(projectId).map((source) => source.url));
    const added = [];
    let skipped = 0;

    for (const candidate of candidates) {
      try {
        const url = await assertPublicSourceUrl(candidate.url);
        if (existingUrls.has(url)) {
          skipped += 1;
          this.database.setSourceCandidateStatus(candidate.id, "accepted");
          continue;
        }
        const source = this.database.createSource({
          projectId,
          type: candidate.type,
          platform: candidate.platform,
          name: candidate.name,
          url,
          checkFrequency: project.updateFrequency,
        });
        existingUrls.add(url);
        added.push(source);
        this.database.setSourceCandidateStatus(candidate.id, "accepted");
        this.database.createCardIfNew({
          projectId,
          type: "source",
          title: source.name,
          content: `${source.type === "rss" ? "RSS 订阅" : source.type === "search" ? "新媒体搜索监控" : "网页监控"}\n由来源发现 Agent 添加\n${candidate.rationale}`,
          sourceUrl: source.url,
          sourceName: source.name,
          importance: candidate.confidence >= 0.8 ? 2 : 1,
          position: { x: 80 + (added.length % 2) * 380, y: 720 + Math.floor(added.length / 2) * 250 },
        });
      } catch {
        skipped += 1;
      }
    }
    return { added, skipped };
  }

  dismiss(candidateId: string): void {
    this.database.setSourceCandidateStatus(candidateId, "dismissed");
  }

  private requireProject(projectId: string): Project {
    const project = this.database.getProject(projectId);
    if (!project) throw new Error("项目不存在");
    return project;
  }

  private async fromExistingPages(
    sources: ReturnType<ResearchDatabase["listSources"]>,
    warnings: string[],
  ): Promise<CandidateDraft[]> {
    const results = await mapConcurrent(sources.slice(0, 4), 4, async (source) => {
      const candidates: CandidateDraft[] = [];
      try {
        const response = await this.fetchImpl(source.url, {
          headers: { accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return { candidates, warning: null };
        const html = await response.text();
        if (html.length <= 2_000_000) candidates.push(...discoverFeedLinks(html, response.url || source.url));
        return { candidates, warning: null };
      } catch {
        return { candidates, warning: `${source.name}：无法检查页面中的订阅链接` };
      }
    });
    warnings.push(...results.flatMap((result) => result.warning ? [result.warning] : []));
    return results.flatMap((result) => result.candidates);
  }

  private async probe(candidate: CandidateDraft): Promise<boolean> {
    try {
      const url = await assertPublicSourceUrl(candidate.url);
      if (candidate.type === "search") return true;
      let response = await fetchPublicUrl(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(8_000),
      }, this.fetchImpl);
      if (response.status === 405 || response.status === 403) {
        response = await fetchPublicUrl(url, {
          headers: { range: "bytes=0-1024" },
          signal: AbortSignal.timeout(8_000),
        }, this.fetchImpl);
        await response.body?.cancel();
      }
      if (response.url) await assertPublicSourceUrl(response.url);
      return response.ok;
    } catch {
      return false;
    }
  }
}
