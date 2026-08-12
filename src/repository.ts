import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  type ConnectorEvent,
  type KnowledgeRecord,
  type RecordType,
  type ValidationIssue,
  recordDirectories,
  recordTypes,
} from "./types.js";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const requiredFields = ["id", "type", "title", "status", "owner", "created", "updated", "sensitivity"];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 72) || "record";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function serialize(metadata: Record<string, unknown>, body: string): string {
  return `---\n${YAML.stringify(metadata, { lineWidth: 0 }).trimEnd()}\n---\n\n${body.trim()}\n`;
}

export class MarkdownRepository {
  constructor(readonly contentRoot: string) {}

  getDestination(type: RecordType, filename?: string) {
    const directory = recordDirectories[type];
    return {
      contentRoot: this.contentRoot,
      type,
      directory,
      relativePath: filename ? path.join(directory, filename) : `${directory}/`,
      absolutePath: path.join(this.contentRoot, directory, filename ?? ""),
    };
  }

  async ensureLayout(): Promise<void> {
    await Promise.all(
      Object.values(recordDirectories).map((directory) =>
        mkdir(path.join(this.contentRoot, directory), { recursive: true }),
      ),
    );
  }

  async listRecords(): Promise<KnowledgeRecord[]> {
    await this.ensureLayout();
    const records: KnowledgeRecord[] = [];

    for (const directory of Object.values(recordDirectories)) {
      const absoluteDirectory = path.join(this.contentRoot, directory);
      const entries = await readdir(absoluteDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        records.push(await this.readPath(path.join(absoluteDirectory, entry.name)));
      }
    }

    return records.sort((a, b) => String(b.metadata.updated ?? "").localeCompare(String(a.metadata.updated ?? "")));
  }

  async getById(id: string): Promise<KnowledgeRecord | undefined> {
    const normalized = id.trim().toUpperCase();
    return (await this.listRecords()).find(
      (record) => String(record.metadata.id ?? "").toUpperCase() === normalized,
    );
  }

  async search(options: {
    query?: string;
    types?: RecordType[];
    statuses?: string[];
    domains?: string[];
    since?: string;
    limit?: number;
  }): Promise<KnowledgeRecord[]> {
    const terms = (options.query ?? "")
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const allowedTypes = new Set(options.types ?? []);
    const allowedStatuses = new Set((options.statuses ?? []).map((value) => value.toLocaleLowerCase()));
    const domains = new Set((options.domains ?? []).map((value) => value.toLocaleLowerCase()));

    const matches = (await this.listRecords()).filter((record) => {
      const type = String(record.metadata.type ?? "") as RecordType;
      if (allowedTypes.size && !allowedTypes.has(type)) return false;
      if (allowedStatuses.size && !allowedStatuses.has(String(record.metadata.status ?? "").toLocaleLowerCase())) return false;
      if (options.since && String(record.metadata.updated ?? "") < options.since) return false;
      if (domains.size) {
        const recordDomains = asStringArray(record.metadata.domains).map((value) => value.toLocaleLowerCase());
        if (!recordDomains.some((domain) => domains.has(domain))) return false;
      }
      const haystack = `${YAML.stringify(record.metadata)}\n${record.body}`.toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    });

    return matches.slice(0, Math.min(options.limit ?? 25, 100));
  }

  async submitSignal(input: {
    title: string;
    summary: string;
    sourceType: string;
    owner: string;
    evidenceLinks?: string[];
    domains?: string[];
    tags?: string[];
    sensitivity?: string;
    confidence?: string;
    externalRef?: string;
    occurredAt?: string;
  }): Promise<KnowledgeRecord> {
    await this.ensureLayout();
    if (input.externalRef) {
      const existing = (await this.listRecords()).find((record) =>
        asStringArray(record.metadata.external_refs).includes(input.externalRef!),
      );
      if (existing) return existing;
    }

    const now = new Date().toISOString().slice(0, 10);
    const id = await this.nextSignalId(now.slice(0, 4));
    const metadata: Record<string, unknown> = {
      id,
      type: "signal",
      title: input.title,
      status: "new",
      owner: input.owner,
      created: now,
      updated: now,
      review_by: now,
      domains: input.domains ?? [],
      audiences: ["product"],
      sensitivity: input.sensitivity ?? "internal",
      tags: input.tags ?? [],
      related: [],
      source_type: input.sourceType,
      confidence: input.confidence ?? "medium",
      ...(input.externalRef ? { external_refs: [input.externalRef] } : {}),
      ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
    };
    const evidence = (input.evidenceLinks ?? []).length
      ? input.evidenceLinks!.map((link) => `- ${link}`).join("\n")
      : "- No source link supplied.";
    const body = `# Summary\n\n${input.summary}\n\n## Who and context\n\nNot yet classified.\n\n## Evidence\n\n${evidence}\n\n## Possible implication\n\nTo be assessed during triage.\n\n## Triage\n\n- Outcome:\n- Reason:\n- Linked records:`;
    const filename = `${id.toLowerCase()}-${slugify(input.title)}.md`;
    const absolutePath = path.join(this.contentRoot, recordDirectories.signal, filename);
    await writeFile(absolutePath, serialize(metadata, body), { encoding: "utf8", flag: "wx" });
    return this.readPath(absolutePath);
  }

  async importConnectorEvents(
    connector: string,
    events: ConnectorEvent[],
    owner: string,
    sensitivity = "internal",
  ): Promise<{ created: KnowledgeRecord[]; existing: KnowledgeRecord[] }> {
    const created: KnowledgeRecord[] = [];
    const existing: KnowledgeRecord[] = [];

    for (const event of events) {
      const externalRef = `${connector}:${event.externalId}`;
      const before = (await this.listRecords()).find((record) =>
        asStringArray(record.metadata.external_refs).includes(externalRef),
      );
      if (before) {
        existing.push(before);
        continue;
      }
      created.push(
        await this.submitSignal({
          title: `${connector}: ${event.summary.slice(0, 90)}`,
          summary: event.summary,
          sourceType: connector,
          owner,
          evidenceLinks: event.url ? [event.url] : [],
          domains: event.domains,
          tags: [...(event.tags ?? []), `connector:${connector}`],
          sensitivity,
          confidence: event.confidence,
          externalRef,
          occurredAt: event.occurredAt,
        }),
      );
    }

    return { created, existing };
  }

  async validate(): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const records = await this.listRecords();
    const ids = new Map<string, string>();

    for (const record of records) {
      for (const field of requiredFields) {
        if (record.metadata[field] === undefined || record.metadata[field] === "") {
          issues.push({ path: record.path, message: `Missing required frontmatter field: ${field}` });
        }
      }
      if (record.metadata.type && !recordTypes.includes(record.metadata.type as RecordType)) {
        issues.push({ path: record.path, message: `Unknown record type: ${String(record.metadata.type)}` });
      }
      if (recordTypes.includes(record.metadata.type as RecordType)) {
        const expectedDirectory = recordDirectories[record.metadata.type as RecordType];
        const actualDirectory = record.path.split(path.sep)[0];
        if (actualDirectory !== expectedDirectory) {
          issues.push({
            path: record.path,
            message: `Record type ${String(record.metadata.type)} belongs in ${expectedDirectory}/`,
          });
        }
      }
      const id = String(record.metadata.id ?? "");
      if (id && ids.has(id)) {
        issues.push({ path: record.path, message: `Duplicate ID ${id}; first seen in ${ids.get(id)}` });
      } else if (id) {
        ids.set(id, record.path);
      }
    }

    return issues;
  }

  private async readPath(absolutePath: string): Promise<KnowledgeRecord> {
    const raw = await readFile(absolutePath, "utf8");
    const match = raw.match(FRONTMATTER);
    const metadata = match ? (YAML.parse(match[1]) as Record<string, unknown>) : {};
    return {
      path: path.relative(this.contentRoot, absolutePath),
      metadata: metadata ?? {},
      body: match ? raw.slice(match[0].length).trim() : raw.trim(),
      raw,
    };
  }

  private async nextSignalId(year: string): Promise<string> {
    const prefix = `SIG-${year}-`;
    const numbers = (await this.listRecords())
      .map((record) => String(record.metadata.id ?? ""))
      .filter((id) => id.startsWith(prefix))
      .map((id) => Number.parseInt(id.slice(prefix.length), 10))
      .filter(Number.isFinite);
    return `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(3, "0")}`;
  }
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
