export const standardRecordTypes = ["room", "work", "page", "decision", "outcome", "note"] as const;
export type StandardRecordType = (typeof standardRecordTypes)[number];
export const standardRecordDirectories: Record<StandardRecordType, string> = {
  room: "rooms", work: "work", page: "pages", decision: "decisions", outcome: "outcomes", note: "notes",
};
export interface KnowledgeRecord {
  path: string;
  metadata: Record<string, unknown> & { id?: string; type?: string; title?: string; status?: string; sensitivity?: string };
  body: string;
  raw: string;
}
export interface ConnectorEvent {
  externalId: string; title?: string; summary: string; occurredAt?: string; url?: string; tags?: string[];
}
export interface ValidationIssue { path: string; message: string }
