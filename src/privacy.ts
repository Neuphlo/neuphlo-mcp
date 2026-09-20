import YAML from "yaml";
import type { KnowledgeRecord } from "./types.js";

const publicMetadataFields = [
  "id",
  "type",
  "area",
  "title",
  "status",
  "created",
  "updated",
  "sensitivity",
  "tags",
] as const;

export function publicMetadata(record: KnowledgeRecord): Record<string, unknown> {
  return Object.fromEntries(
    publicMetadataFields
      .filter((field) => record.metadata[field] !== undefined)
      .map((field) => [field, record.metadata[field]]),
  );
}

export function publicMarkdown(record: KnowledgeRecord): string {
  return `---\n${YAML.stringify(publicMetadata(record), { lineWidth: 0 }).trimEnd()}\n---\n\n${record.body.trim()}\n`;
}
