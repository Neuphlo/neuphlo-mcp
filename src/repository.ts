import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { type ConnectorEvent, type KnowledgeRecord, type ValidationIssue, standardRecordDirectories } from "./types.js";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const requiredFields = ["id", "type", "title", "status", "owner", "created", "updated"];
const TYPE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const slugify = (value: string) => value.normalize("NFKD").replace(/[^a-zA-Z0-9\s-]/g, "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 72) || "record";
const asStringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const serialize = (metadata: Record<string, unknown>, body: string) => `---\n${YAML.stringify(metadata, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
function directoryFor(type: string): string {
  if (!TYPE.test(type)) throw new Error("Record type must use lowercase letters, numbers, and hyphens.");
  return standardRecordDirectories[type as keyof typeof standardRecordDirectories] ?? type;
}

export class MarkdownRepository {
  constructor(readonly contentRoot: string) {}
  getDestination(type: string, filename?: string) {
    const directory = directoryFor(type);
    return { contentRoot: this.contentRoot, type, directory, relativePath: filename ? path.join(directory, filename) : `${directory}/`, absolutePath: path.join(this.contentRoot, directory, filename ?? "") };
  }
  async ensureLayout(): Promise<void> {
    await mkdir(this.contentRoot, { recursive: true });
    await Promise.all(Object.values(standardRecordDirectories).map((directory) => mkdir(path.join(this.contentRoot, directory), { recursive: true })));
  }
  async listRecords(): Promise<KnowledgeRecord[]> {
    await this.ensureLayout();
    const records: KnowledgeRecord[] = [];
    const walk = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "_templates") continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(target);
        else if (entry.isFile() && entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md") records.push(await this.readPath(target));
      }
    };
    await walk(this.contentRoot);
    return records.sort((a, b) => String(b.metadata.updated ?? "").localeCompare(String(a.metadata.updated ?? "")));
  }
  async getById(id: string): Promise<KnowledgeRecord | undefined> {
    const normalized = id.trim().toLocaleLowerCase();
    return (await this.listRecords()).find((record) => String(record.metadata.id ?? "").toLocaleLowerCase() === normalized);
  }
  async search(options: { query?: string; types?: string[]; statuses?: string[]; tags?: string[]; since?: string; limit?: number }): Promise<KnowledgeRecord[]> {
    const terms = (options.query ?? "").toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const types = new Set(options.types ?? []);
    const statuses = new Set((options.statuses ?? []).map((value) => value.toLocaleLowerCase()));
    const tags = new Set((options.tags ?? []).map((value) => value.toLocaleLowerCase()));
    const matches = (await this.listRecords()).filter((record) => {
      if (types.size && !types.has(String(record.metadata.type ?? ""))) return false;
      if (statuses.size && !statuses.has(String(record.metadata.status ?? "").toLocaleLowerCase())) return false;
      if (options.since && String(record.metadata.updated ?? "") < options.since) return false;
      if (tags.size && !asStringArray(record.metadata.tags).some((tag) => tags.has(tag.toLocaleLowerCase()))) return false;
      const haystack = `${YAML.stringify(record.metadata)}\n${record.body}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return matches.slice(0, Math.min(options.limit ?? 25, 100));
  }
  async createRecord(input: { type: string; title: string; content: string; owner: string; status?: string; tags?: string[]; sensitivity?: string; externalRef?: string; occurredAt?: string }): Promise<KnowledgeRecord> {
    await this.ensureLayout();
    if (input.externalRef) {
      const existing = (await this.listRecords()).find((record) => asStringArray(record.metadata.external_refs).includes(input.externalRef!));
      if (existing) return existing;
    }
    const type = input.type.trim().toLowerCase();
    const directory = directoryFor(type);
    await mkdir(path.join(this.contentRoot, directory), { recursive: true });
    const now = new Date().toISOString();
    const id = await this.nextId(type);
    const metadata: Record<string, unknown> = { id, type, title: input.title, status: input.status ?? "open", owner: input.owner, created: now, updated: now, sensitivity: input.sensitivity ?? "internal", tags: input.tags ?? [], ...(input.externalRef ? { external_refs: [input.externalRef] } : {}), ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}) };
    const absolutePath = path.join(this.contentRoot, directory, `${id}-${slugify(input.title)}.md`);
    await writeFile(absolutePath, serialize(metadata, input.content), { encoding: "utf8", flag: "wx" });
    return this.readPath(absolutePath);
  }
  async importConnectorEvents(connector: string, events: ConnectorEvent[], owner: string, sensitivity = "internal") {
    const created: KnowledgeRecord[] = [], existing: KnowledgeRecord[] = [];
    for (const event of events) {
      const externalRef = `${connector}:${event.externalId}`;
      const before = (await this.listRecords()).find((record) => asStringArray(record.metadata.external_refs).includes(externalRef));
      if (before) { existing.push(before); continue; }
      created.push(await this.createRecord({ type: "note", title: event.title ?? `${connector}: ${event.summary.slice(0, 90)}`, content: event.url ? `${event.summary}\n\nSource: ${event.url}` : event.summary, owner, tags: [...(event.tags ?? []), `connector:${connector}`], sensitivity, externalRef, occurredAt: event.occurredAt }));
    }
    return { created, existing };
  }
  async validate(): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [], ids = new Map<string, string>();
    for (const record of await this.listRecords()) {
      for (const field of requiredFields) if (record.metadata[field] === undefined || record.metadata[field] === "") issues.push({ path: record.path, message: `Missing required frontmatter field: ${field}` });
      const type = String(record.metadata.type ?? "");
      if (type && !TYPE.test(type)) issues.push({ path: record.path, message: `Invalid record type: ${type}` });
      const id = String(record.metadata.id ?? ""), key = id.toLocaleLowerCase();
      if (id && ids.has(key)) issues.push({ path: record.path, message: `Duplicate ID ${id}; first seen in ${ids.get(key)}` }); else if (id) ids.set(key, record.path);
    }
    return issues;
  }
  private async readPath(absolutePath: string): Promise<KnowledgeRecord> {
    const raw = await readFile(absolutePath, "utf8"), match = raw.match(FRONTMATTER);
    const metadata = match ? (YAML.parse(match[1]) as Record<string, unknown>) : {};
    return { path: path.relative(this.contentRoot, absolutePath), metadata: metadata ?? {}, body: match ? raw.slice(match[0].length).trim() : raw.trim(), raw };
  }
  private async nextId(type: string): Promise<string> {
    const prefix = `${type}-`;
    const numbers = (await this.listRecords()).map((record) => String(record.metadata.id ?? "")).filter((id) => id.startsWith(prefix)).map((id) => Number.parseInt(id.slice(prefix.length), 10)).filter(Number.isFinite);
    return `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}`;
  }
}
export async function pathExists(target: string): Promise<boolean> { try { await access(target); return true; } catch { return false; } }
