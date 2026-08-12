export const recordTypes = [
  "signal",
  "customer-insight",
  "decision",
  "initiative",
  "release",
  "brief",
] as const;

export type RecordType = (typeof recordTypes)[number];

export const recordDirectories: Record<RecordType, string> = {
  signal: "inbox",
  "customer-insight": "customer-insights",
  decision: "decisions",
  initiative: "initiatives",
  release: "releases",
  brief: "briefs",
};

export interface KnowledgeRecord {
  path: string;
  metadata: Record<string, unknown> & {
    id?: string;
    type?: string;
    title?: string;
    status?: string;
    sensitivity?: string;
  };
  body: string;
  raw: string;
}

export interface ConnectorEvent {
  externalId: string;
  summary: string;
  occurredAt?: string;
  url?: string;
  domains?: string[];
  tags?: string[];
  confidence?: "low" | "medium" | "high";
}

export interface ValidationIssue {
  path: string;
  message: string;
}
