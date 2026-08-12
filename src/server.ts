import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { publicConnectorStatus } from "./connectors.js";
import { MarkdownRepository } from "./repository.js";
import { recordTypes, type RecordType } from "./types.js";
import { TEMPLATE_NAME, TEMPLATE_VERSION } from "./version.js";

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const UI_RESOURCE_URI = "ui://neuphlo/mcp-template/main.html";
const UI_MIME_TYPE = "text/html;profile=mcp-app";

async function readDashboardHtml(): Promise<string> {
  const configured = process.env.NEUPHLO_MCP_UI_PATH;
  const candidates = [
    configured,
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

export function buildMcpServer(repository: MarkdownRepository, writeMode: "readonly" | "direct"): McpServer {
  const appName = process.env.MCP_APP_NAME?.trim() || "Documentation";
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
    "starter-app",
    UI_RESOURCE_URI,
    {
      title: appName,
      description: "Example MCP App with a Markdown dashboard, inline table, and write form.",
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
    "neuphlo://index",
    { title: "Starter Markdown record index", mimeType: "application/json" },
    async (uri) => {
      const records = await repository.listRecords();
      return {
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(records.map(recordSummary), null, 2) }],
      };
    },
  );

  server.registerResource(
    "connector-catalog",
    "neuphlo://connectors",
    { title: "Available source connectors", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(publicConnectorStatus(), null, 2) }],
    }),
  );

  server.registerResource(
    "knowledge-record",
    new ResourceTemplate("neuphlo://records/{id}", {
      list: async () => ({
        resources: (await repository.listRecords()).map((record) => ({
          uri: `neuphlo://records/${encodeURIComponent(String(record.metadata.id))}`,
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
    "open_neuphlo_dashboard",
    {
      title: "Open the Neuphlo template dashboard",
      description: "Show the Neuphlo template's example Markdown records, connectors, filters, and write form.",
      inputSchema: z.object({
        audience: z.enum(["all", "support", "sales", "marketing", "product", "engineering", "leadership"]).default("all"),
        since: z.string().optional().describe("Inclusive YYYY-MM-DD updated-date filter."),
      }),
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ audience, since }) => {
      const records = await repository.search({ since, limit: 100 });
      const visible = records.filter((record) => {
        if (audience === "all") return true;
        const audiences = Array.isArray(record.metadata.audiences) ? record.metadata.audiences : [];
        return audiences.length === 0 || audiences.includes(audience);
      });
      const totals = Object.fromEntries(recordTypes.map((type) => [type, 0]));
      for (const record of visible) {
        const type = String(record.metadata.type ?? "");
        totals[type] = (totals[type] ?? 0) + 1;
      }
      const dashboard = {
        view: "dashboard" as const,
        appName,
        generatedAt: new Date().toISOString(),
        audience,
        writeMode,
        totals,
        records: visible.map((record) => ({
          ...recordSummary(record),
          sensitivity: record.metadata.sensitivity,
          excerpt: record.body.replace(/^#+\s.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 260),
        })),
        connectors: publicConnectorStatus(),
      };
      return {
        content: [{ type: "text", text: `Dashboard loaded with ${visible.length} records for ${audience}.` }],
        structuredContent: dashboard,
      };
    },
  );

  server.registerTool(
    "show_knowledge_table",
    {
      title: "Show Markdown records as a table",
      description: "Return an interactive inline table for comparing signals, insights, decisions, initiatives, releases, or briefs. Use when the user asks to see, compare, list, or review records in a table.",
      inputSchema: z.object({
        query: z.string().default(""),
        types: z.array(z.enum(recordTypes)).optional(),
        statuses: z.array(z.string()).optional(),
        audience: z.enum(["all", "support", "sales", "marketing", "product", "engineering", "leadership"]).default("all"),
        domains: z.array(z.string()).default([]),
        since: z.string().optional().describe("Inclusive YYYY-MM-DD updated-date filter."),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
      _meta: { ui: { resourceUri: UI_RESOURCE_URI } },
    },
    async ({ query, types, statuses, audience, domains, since, limit }) => {
      const records = await repository.search({ query, types, statuses, domains, since, limit });
      const visible = records.filter((record) => {
        if (audience === "all") return true;
        const audiences = Array.isArray(record.metadata.audiences) ? record.metadata.audiences : [];
        return audiences.length === 0 || audiences.includes(audience);
      });
      const rows = visible.map((record) => ({
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
        title: audience === "all" ? "Markdown records" : `${audience[0].toUpperCase()}${audience.slice(1)} records`,
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
    "search_knowledge",
    {
      title: "Search Markdown records",
      description: "Search canonical Markdown records by text and metadata.",
      inputSchema: z.object({
        query: z.string().default(""),
        types: z.array(z.enum(recordTypes)).optional(),
        statuses: z.array(z.string()).optional(),
        domains: z.array(z.string()).optional(),
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
        type: z.enum(recordTypes),
        filename: z.string().regex(/^[a-z0-9][a-z0-9-]*\.md$/).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ type, filename }) => text(repository.getDestination(type, filename)),
  );

  server.registerTool(
    "submit_signal",
    {
      title: "Submit an example signal",
      description: "Create a new example Markdown signal for the starter workflow.",
      inputSchema: z.object({
        title: z.string().min(3).max(140),
        summary: z.string().min(3).max(5000),
        sourceType: z.string().min(1),
        owner: z.string().min(1),
        evidenceLinks: z.array(z.string().url()).default([]),
        domains: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
        sensitivity: z.enum(["internal", "restricted", "public-approved"]).default("internal"),
        confidence: z.enum(["low", "medium", "high"]).default("medium"),
      }),
      annotations: { destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      if (writeMode === "readonly") return { ...text("Server is running in readonly mode."), isError: true };
      const record = await repository.submitSignal(input);
      return text({ created: recordSummary(record), resource: `neuphlo://records/${record.metadata.id}` });
    },
  );

  server.registerTool(
    "import_connector_events",
    {
      title: "Import normalized connector events",
      description: "Import deduplicated events from Intercom, HubSpot, exports, webhooks, or future adapters as Markdown signals.",
      inputSchema: z.object({
        connector: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
        owner: z.string().min(1),
        sensitivity: z.enum(["internal", "restricted"]).default("internal"),
        events: z.array(z.object({
          externalId: z.string().min(1).max(200),
          summary: z.string().min(3).max(5000),
          occurredAt: z.string().optional(),
          url: z.string().url().optional(),
          domains: z.array(z.string()).default([]),
          tags: z.array(z.string()).default([]),
          confidence: z.enum(["low", "medium", "high"]).default("medium"),
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
      description: "Check required metadata, known record types, and duplicate IDs.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => {
      const issues = await repository.validate();
      return text({ valid: issues.length === 0, issues });
    },
  );

  server.registerTool(
    "build_brief",
    {
      title: "Build a role brief",
      description: "Assemble changed canonical records for an audience without writing a duplicate source of truth.",
      inputSchema: z.object({
        audience: z.enum(["support", "sales", "marketing", "product", "engineering", "leadership"]),
        since: z.string().describe("Inclusive YYYY-MM-DD updated-date filter."),
        domains: z.array(z.string()).default([]),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ audience, since, domains }) => {
      const records = await repository.search({ since, domains, limit: 100 });
      const relevant = records.filter((record) => {
        const audiences = Array.isArray(record.metadata.audiences) ? record.metadata.audiences : [];
        return audiences.length === 0 || audiences.includes(audience);
      });
      const lines = relevant.map(
        (record) => `- **${String(record.metadata.title)}** (${String(record.metadata.id)}, ${String(record.metadata.status)}) — neuphlo://records/${String(record.metadata.id)}`,
      );
      return text(`# ${audience[0].toUpperCase()}${audience.slice(1)} brief since ${since}\n\n${lines.join("\n") || "No changed records matched."}`);
    },
  );

  server.registerPrompt(
    "triage-signals",
    {
      title: "Triage recent signals",
      description: "Guide a review of recent Support, Sales, Marketing, or connector signals.",
      argsSchema: z.object({ since: z.string(), domain: z.string().optional() }),
    },
    ({ since, domain }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Search signal records updated since ${since}${domain ? ` for domain ${domain}` : ""}. Group evidence without merging unlike problems. Recommend one of linked, promoted, duplicate, deferred, or closed for each signal, and cite stable record IDs. Treat the included workflow as an example to customize.`,
        },
      }],
    }),
  );

  return server;
}
