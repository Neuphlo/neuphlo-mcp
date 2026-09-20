import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { publicConnectorStatus } from "./connectors.js";
import { MarkdownRepository } from "./repository.js";
import { standardRecordTypes } from "./types.js";
import { TEMPLATE_NAME, TEMPLATE_VERSION } from "./version.js";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const UI_RESOURCE_URI = "ui://knowledge-workspace/dashboard-v1.html";
const KNOWLEDGE_INDEX_URI = "knowledge://index";
const CONNECTOR_CATALOG_URI = "knowledge://connectors";
const KNOWLEDGE_RECORD_TEMPLATE = "knowledge://records/{id}";
const UI_MIME_TYPE = "text/html;profile=mcp-app";
const UI_RESOURCE_URI_LEGACY_META_KEY = "ui/resourceUri";

const uiToolMeta = {
  ui: { resourceUri: UI_RESOURCE_URI },
  [UI_RESOURCE_URI_LEGACY_META_KEY]: UI_RESOURCE_URI,
};

async function readDashboardHtml(): Promise<string> {
  const configured = process.env.MCP_UI_PATH;
  const candidates = [
    configured,
    path.resolve(import.meta.dirname, "ui/index.html"),
    path.resolve(import.meta.dirname, "../ui/index.html"),
    path.resolve(process.cwd(), "dist/ui/index.html"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {}
  }
  throw new Error("MCP App bundle not found. Run `npm run build:ui` before starting the server.");
}

function recordUri(id: unknown): string {
  return `knowledge://records/${encodeURIComponent(String(id))}`;
}

function structuredText(value: Record<string, unknown>) {
  return {
    structuredContent: value,
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
  };
}

function recordSummary(record: Awaited<ReturnType<MarkdownRepository["listRecords"]>>[number]) {
  return {
    id: record.metadata.id,
    type: record.metadata.type,
    title: record.metadata.title,
    status: record.metadata.status,
    updated: record.metadata.updated,
    path: record.path,
  };
}

export function buildMcpServer(
  repository: MarkdownRepository,
  writeMode: "readonly" | "direct",
  access: "read" | "write" = "write",
): McpServer {
  const appName = process.env.MCP_APP_NAME?.trim() || "Documentation";
  const effectiveWriteMode = access === "write" ? writeMode : "readonly";
  const server = new McpServer(
    { name: TEMPLATE_NAME, version: TEMPLATE_VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [UI_MIME_TYPE] } },
      },
    },
  );

  server.registerResource(
    "knowledge-workspace",
    UI_RESOURCE_URI,
    {
      title: appName,
      description: "Interactive Markdown knowledge dashboard, inline table, and write form.",
      mimeType: UI_MIME_TYPE,
      _meta: {
        ui: {
          csp: { connectDomains: [], resourceDomains: [] },
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [{
        uri: UI_RESOURCE_URI,
        mimeType: UI_MIME_TYPE,
        text: await readDashboardHtml(),
        _meta: {
          ui: {
            csp: { connectDomains: [], resourceDomains: [] },
            prefersBorder: true,
          },
        },
      }],
    }),
  );

  server.registerResource(
    "knowledge-index",
    KNOWLEDGE_INDEX_URI,
    { title: "Markdown record index", mimeType: "application/json" },
    async (uri) => {
      const records = await repository.listRecords();
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(records.map(recordSummary), null, 2) }],
      };
    },
  );

  server.registerResource(
    "connector-catalog",
    CONNECTOR_CATALOG_URI,
    { title: "Available source connectors", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(publicConnectorStatus(), null, 2) }],
    }),
  );

  server.registerResource(
    "knowledge-record",
    new ResourceTemplate(KNOWLEDGE_RECORD_TEMPLATE, {
      list: async () => ({
        resources: (await repository.listRecords()).map((record) => ({
          uri: recordUri(record.metadata.id),
          name: String(record.metadata.title ?? record.metadata.id),
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "Knowledge record", mimeType: "text/markdown" },
    async (uri, variables) => {
      const record = await repository.getById(decodeURIComponent(String(variables.id)));
      if (!record) throw new Error(`Record not found: ${String(variables.id)}`);
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: record.raw }] };
    },
  );

  server.registerTool(
    "open_dashboard",
    {
      title: "Open the knowledge dashboard",
      description: "Use this when a person wants an interactive overview of Markdown records, connectors, filters, and available write actions.",
      inputSchema: z.object({
        since: z.string().optional().describe("Inclusive YYYY-MM-DD updated-date filter."),
      }),
      annotations: { readOnlyHint: true },
      _meta: uiToolMeta,
    },
    async ({ since }) => {
      const records = await repository.search({ since, limit: 100 });
      const totals: Record<string, number> = {};
      for (const record of records) {
        const type = String(record.metadata.type ?? "");
        totals[type] = (totals[type] ?? 0) + 1;
      }
      const dashboard = {
        view: "dashboard" as const,
        appName,
        generatedAt: new Date().toISOString(),
        writeMode: effectiveWriteMode,
        totals,
        standardRecordTypes,
        records: records.map((record) => ({
          ...recordSummary(record),
          sensitivity: record.metadata.sensitivity,
          excerpt: record.body.replace(/^#+\s.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 260),
        })),
        connectors: publicConnectorStatus(),
      };
      return {
        content: [{ type: "text", text: `Dashboard loaded with ${records.length} records.` }],
        structuredContent: dashboard,
      };
    },
  );

  server.registerTool(
    "show_knowledge_table",
    {
      title: "Show Markdown records as a table",
      description: "Use this when a person asks to see, compare, list, or review Markdown records in an interactive table.",
      inputSchema: z.object({
        query: z.string().default(""),
        types: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional(),
        tags: z.array(z.string()).default([]),
        since: z.string().optional().describe("Inclusive YYYY-MM-DD updated-date filter."),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
      _meta: uiToolMeta,
    },
    async ({ query, types, statuses, tags, since, limit }) => {
      const records = await repository.search({ query, types, statuses, tags, since, limit });
      const rows = records.map((record) => ({
        id: String(record.metadata.id ?? ""),
        title: String(record.metadata.title ?? ""),
        type: String(record.metadata.type ?? ""),
        status: String(record.metadata.status ?? ""),
        owner: String(record.metadata.owner ?? ""),
        updated: String(record.metadata.updated ?? ""),
        sensitivity: String(record.metadata.sensitivity ?? "internal"),
      }));
      const table = {
        view: "knowledge-table" as const,
        appName,
        title: "Markdown records",
        description: `Canonical records${since ? ` updated since ${since}` : ""}${query ? ` matching “${query}”` : ""}.`,
        columns: [
          { key: "id", label: "ID" },
          { key: "title", label: "Title" },
          { key: "type", label: "Type" },
          { key: "status", label: "Status" },
          { key: "owner", label: "Owner" },
          { key: "updated", label: "Updated" },
          { key: "sensitivity", label: "Visibility" },
        ],
        rows,
      };
      return {
        content: [{ type: "text", text: `Found ${rows.length} matching knowledge records.` }],
        structuredContent: table,
      };
    },
  );

  server.registerTool(
    "search",
    {
      title: "Search knowledge",
      description: "Use this when an agent needs to find relevant Markdown records by keywords.",
      inputSchema: z.object({ query: z.string() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const records = await repository.search({ query, limit: 25 });
      return structuredText({
        results: records.map((record) => ({
          id: String(record.metadata.id ?? ""),
          title: String(record.metadata.title ?? record.metadata.id ?? "Untitled record"),
          url: recordUri(record.metadata.id),
        })),
      });
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch a knowledge record",
      description: "Use this when an agent needs the complete Markdown and metadata for a record returned by search.",
      inputSchema: z.object({ id: z.string().min(1) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const record = await repository.getById(id);
      if (!record) return { ...text(`Record not found: ${id}`), isError: true };
      return structuredText({
        id: String(record.metadata.id ?? id),
        title: String(record.metadata.title ?? record.metadata.id ?? id),
        text: record.raw,
        url: recordUri(record.metadata.id ?? id),
        metadata: { ...record.metadata, path: record.path },
      });
    },
  );

  server.registerTool(
    "search_knowledge",
    {
      title: "Search Markdown records",
      description: "Search canonical Markdown records by text and metadata.",
      inputSchema: z.object({
        query: z.string().default(""),
        types: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional(),
        tags: z.array(z.string()).optional(),
        since: z.string().optional().describe("Inclusive YYYY-MM-DD updated-date filter."),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
    async (input) => text((await repository.search(input)).map((record) => ({ ...recordSummary(record), excerpt: record.body.slice(0, 400) }))),
  );

  server.registerTool(
    "get_record",
    {
      title: "Get a knowledge record",
      description: "Read one canonical Markdown record by stable ID.",
      inputSchema: z.object({ id: z.string().min(1) }),
    },
    async ({ id }) => {
      const record = await repository.getById(id);
      return record ? text(record.raw) : { ...text(`Record not found: ${id}`), isError: true };
    },
  );

  server.registerTool(
    "get_content_destination",
    {
      title: "Get the Markdown content destination",
      description: "Return the configured content root and correct subfolder for a record type before creating a file.",
      inputSchema: z.object({
        type: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
        filename: z.string().regex(/^[a-z0-9][a-z0-9-]*\.md$/).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ type, filename }) => text(repository.getDestination(type, filename)),
  );

  if (access === "write") server.registerTool(
    "create_record",
    {
      title: "Create a Markdown record",
      description: "Create a record using a standard collaboration type or a custom business type.",
      inputSchema: z.object({
        type: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).describe("Examples: room, work, page, decision, outcome, note, or a custom type."),
        title: z.string().min(3).max(140),
        content: z.string().min(1).max(100_000),
        owner: z.string().min(1),
        status: z.string().min(1).default("open"),
        tags: z.array(z.string()).default([]),
        sensitivity: z.enum(["internal", "restricted", "public-approved"]).default("internal"),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      if (writeMode === "readonly") return { ...text("Server is running in readonly mode."), isError: true };
      const record = await repository.createRecord(input);
      return text({ created: recordSummary(record), resource: recordUri(record.metadata.id) });
    },
  );

  if (access === "write") server.registerTool(
    "import_connector_events",
    {
      title: "Import normalized connector events",
      description: "Import deduplicated events from external systems as neutral Markdown notes.",
      inputSchema: z.object({
        connector: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
        owner: z.string().min(1),
        sensitivity: z.enum(["internal", "restricted"]).default("internal"),
        events: z.array(z.object({
          externalId: z.string().min(1).max(200),
          summary: z.string().min(3).max(5000),
          occurredAt: z.string().optional(),
          url: z.string().url().optional(),
          tags: z.array(z.string()).default([]),
        })).min(1).max(100),
      }),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    async ({ connector, events, owner, sensitivity }) => {
      if (writeMode === "readonly") return { ...text("Server is running in readonly mode."), isError: true };
      const result = await repository.importConnectorEvents(connector, events, owner, sensitivity);
      return text({
        created: result.created.map(recordSummary),
        skippedAsExisting: result.existing.map(recordSummary),
      });
    },
  );

  server.registerTool(
    "validate_repository",
    {
      title: "Validate Markdown knowledge",
      description: "Check required metadata, safe record types, and duplicate IDs.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const issues = await repository.validate();
      return text({ valid: issues.length === 0, issues });
    },
  );

  server.registerTool(
    "build_summary",
    {
      title: "Build a workspace summary",
      description: "Assemble changed canonical records without writing a duplicate source of truth.",
      inputSchema: z.object({
        since: z.string().describe("Inclusive YYYY-MM-DD updated-date filter."),
        types: z.array(z.string()).default([]),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ since, types }) => {
      const records = await repository.search({ since, types, limit: 100 });
      const lines = records.map(
        (record) => `- **${String(record.metadata.title)}** (${String(record.metadata.id)}, ${String(record.metadata.status)}) — ${recordUri(record.metadata.id)}`,
      );
      return text(`# Workspace summary since ${since}\n\n${lines.join("\n") || "No changed records matched."}`);
    },
  );

  server.registerPrompt(
    "review-workspace",
    {
      title: "Review recent workspace changes",
      description: "Guide a review of recent Work, Pages, decisions, outcomes, notes, and custom records.",
      argsSchema: z.object({ since: z.string(), type: z.string().optional() }),
    },
    ({ since, type }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Review records updated since ${since}${type ? ` with type ${type}` : ""}. Summarize progress, unresolved decisions, outcomes, and follow-up work. Cite stable record IDs and distinguish saved facts from recommendations.`,
        },
      }],
    }),
  );

  return server;
}
