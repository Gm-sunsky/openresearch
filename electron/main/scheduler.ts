import type { Project, Source, TaskRun, UpdateFrequency } from "../../src/shared/contracts";
import { ApiSettingsService } from "./api-settings";
import { ResearchDatabase } from "./database";
import { FeedService } from "./feed-service";
import { SourceDiscoveryAgent } from "./source-discovery";

const FREQUENCY_MS: Record<UpdateFrequency, number> = {
  hourly: 60 * 60 * 1_000,
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
};

export function isSourceDue(source: Source, now = Date.now()): boolean {
  if (source.status === "paused") return false;
  if (!source.lastCheckedAt) return true;
  return now - new Date(source.lastCheckedAt).getTime() >= FREQUENCY_MS[source.checkFrequency];
}

export function isDiscoveryDue(project: Project, runs: TaskRun[], now = Date.now()): boolean {
  const latest = runs.find((run) => run.kind === "discovery");
  if (!latest) return true;
  return now - new Date(latest.startedAt).getTime() >= FREQUENCY_MS[project.updateFrequency];
}

export class ProjectScheduler {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private checking = false;
  private generation = 0;

  constructor(
    private readonly database: ResearchDatabase,
    private readonly feeds: FeedService,
    private readonly discovery?: SourceDiscoveryAgent,
    private readonly settings?: ApiSettingsService,
  ) {}

  start(): void {
    this.stop();
    const run = () => void this.checkDueProjects().catch((error) => console.error("Scheduled check failed", error));
    this.startupTimer = setTimeout(run, 5_000);
    this.startupTimer.unref();
    this.timer = setInterval(run, 60 * 60 * 1_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.timer = null;
    this.startupTimer = null;
    this.generation += 1;
  }

  async checkDueProjects(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    const generation = this.generation;
    try {
      const projects = this.database.listProjects().filter((project) => project.status === "active" && project.updateSelected === true);
      for (const selected of projects) {
        if (generation !== this.generation) break;
        const project = this.database.getProject(selected.id);
        if (!project || project.status !== "active" || project.updateSelected !== true) continue;
        const sources = this.database.listSources(project.id);
        if (sources.length === 0 && this.discovery && this.settings?.get().autoDiscoverSources && isDiscoveryDue(project, this.database.listTaskRuns(project.id))) {
          try {
            await this.discovery.run(project.id);
          } catch (error) {
            console.error(`Scheduled source discovery failed for project ${project.id}`, error);
          }
        }
        // A user can change the selection while discovery is awaiting the network.
        const current = this.database.getProject(project.id);
        if (generation !== this.generation || !current || current.status !== "active" || current.updateSelected !== true) continue;
        if (!this.database.listSources(project.id).some((source) => isSourceDue(source))) continue;
        try {
          await this.feeds.runProject(project.id);
        } catch (error) {
          console.error(`Scheduled update failed for project ${project.id}`, error);
        }
      }
    } finally {
      this.checking = false;
    }
  }
}
