import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildMcpServer } from "../src/server.js";
import { MarkdownRepository } from "../src/repository.js";
import { AccessContext } from "../src/access.js";
import { publicMarkdown } from "../src/privacy.js";

test("serves tools over the modern MCP 2026-07-28 protocol", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-protocol-"));
  const repository = new MarkdownRepository(root);
  await repository.ensureLayout();
  const handler = createMcpHandler(() => buildMcpServer(repository, "direct"));
  const client = new Client(
    { name: "integration-test", version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });

  t.after(async () => {
    await client.close();
    await handler.close();
    await rm(root, { recursive: true, force: true });
  });

  await client.connect(transport);
  assert.equal(client.getProtocolEra(), "modern");
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "search_knowledge"));
  assert.ok(tools.tools.some((tool) => tool.name === "show_knowledge_table"));
  assert.ok(tools.tools.some((tool) => tool.name === "create_record"));
  assert.ok(tools.tools.some((tool) => tool.name === "search"));
  assert.ok(tools.tools.some((tool) => tool.name === "fetch"));
  const hubTool = tools.tools.find((tool) => tool.name === "open_dashboard");
  assert.deepEqual(hubTool?._meta, {
    ui: { resourceUri: "ui://knowledge-workspace/dashboard-v1.html" },
    "ui/resourceUri": "ui://knowledge-workspace/dashboard-v1.html",
  });

  const resources = await client.listResources();
  assert.ok(resources.resources.some((resource) => resource.uri === "ui://knowledge-workspace/dashboard-v1.html"));
  const appResource = await client.readResource({ uri: "ui://knowledge-workspace/dashboard-v1.html" });
  const appContent = appResource.contents[0];
  assert.equal(appContent?.mimeType, "text/html;profile=mcp-app");
  assert.ok(appContent && "text" in appContent);
  assert.match(appContent && "text" in appContent ? appContent.text : "", /Documentation/);

  const dashboard = await client.callTool({
    name: "open_dashboard",
    arguments: {},
  });
  assert.equal((dashboard.structuredContent as { view?: string })?.view, "dashboard");
  assert.equal((dashboard.structuredContent as { appName?: string })?.appName, "Documentation");

  const table = await client.callTool({
    name: "show_knowledge_table",
    arguments: {},
  });
  assert.equal((table.structuredContent as { view?: string })?.view, "knowledge-table");
  assert.ok(Array.isArray((table.structuredContent as { columns?: unknown[] })?.columns));

  const result = await client.callTool({ name: "validate_repository", arguments: {} });
  assert.equal(result.isError, undefined);
  const firstBlock = result.content[0];
  assert.equal(firstBlock?.type, "text");
  assert.deepEqual(JSON.parse(firstBlock?.type === "text" ? firstBlock.text : "{}"), { valid: true, issues: [] });
});

test("search_knowledge advertises a strict read-only schema and preserves its result", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-search-schema-"));
  const repository = new MarkdownRepository(root);
  await repository.ensureLayout();
  const handler = createMcpHandler(() => buildMcpServer(repository, "direct"));
  const client = new Client(
    { name: "search-schema-test", version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });

  t.after(async () => {
    await client.close();
    await handler.close();
    await rm(root, { recursive: true, force: true });
  });

  await client.connect(transport);
  const tool = (await client.listTools()).tools.find((candidate) => candidate.name === "search_knowledge");
  assert.deepEqual(tool?.inputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      query: { default: "", type: "string" },
      types: { type: "array", items: { type: "string" } },
      statuses: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      areas: { type: "array", items: { type: "string" } },
      since: { description: "Inclusive YYYY-MM-DD updated-date filter.", type: "string" },
      limit: { default: 25, type: "integer", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  });
  assert.deepEqual(tool?.annotations, { readOnlyHint: true, openWorldHint: false });

  const before = await repository.listRecords();
  const result = await client.callTool({ name: "search_knowledge", arguments: {} });
  const after = await repository.listRecords();
  assert.deepEqual(after, before);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0]?.type === "text" ? result.content[0].text : undefined, "[]");
});

test("read access does not expose write tools", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-read-protocol-"));
  const repository = new MarkdownRepository(root);
  await repository.ensureLayout();
  const handler = createMcpHandler(() => buildMcpServer(repository, "direct", "read"));
  const client = new Client(
    { name: "read-access-test", version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });

  t.after(async () => {
    await client.close();
    await handler.close();
    await rm(root, { recursive: true, force: true });
  });

  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "search"));
  assert.ok(tools.tools.some((tool) => tool.name === "fetch"));
  assert.ok(!tools.tools.some((tool) => tool.name === "create_record"));
  assert.ok(!tools.tools.some((tool) => tool.name === "import_connector_events"));

  const dashboard = await client.callTool({ name: "open_dashboard", arguments: {} });
  assert.equal((dashboard.structuredContent as { writeMode?: string })?.writeMode, "readonly");
});

test("area grants isolate reads and writes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-area-protocol-"));
  const repository = new MarkdownRepository(root);
  await repository.createRecord({ type: "note", area: "sales", title: "Sales plan", content: "Sales only", owner: "alice" });
  await repository.createRecord({ type: "note", area: "support", title: "Support plan", content: "Support only", owner: "bob" });
  const access = new AccessContext("alice", "shared", [
    { area: "sales", actions: ["read", "write"] },
  ]);
  const handler = createMcpHandler(() => buildMcpServer(repository, "direct", access, ["sales", "support"]));
  const client = new Client(
    { name: "area-access-test", version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });

  t.after(async () => {
    await client.close();
    await handler.close();
    await rm(root, { recursive: true, force: true });
  });

  await client.connect(transport);
  const search = await client.callTool({ name: "search", arguments: { query: "plan" } });
  const searchData = search.structuredContent as { results: Array<{ title: string }> };
  assert.deepEqual(searchData.results.map((result) => result.title), ["Sales plan"]);

  const index = await client.readResource({ uri: "knowledge://index" });
  const indexText = index.contents[0] && "text" in index.contents[0] ? index.contents[0].text : "";
  assert.match(indexText, /Sales plan/);
  assert.doesNotMatch(indexText, /Support plan/);
  await assert.rejects(
    client.readResource({ uri: "knowledge://records/support-note-0001" }),
    /not found/i,
  );

  const hidden = await client.callTool({ name: "fetch", arguments: { id: "support-note-0001" } });
  assert.equal(hidden.isError, true);
  assert.match(hidden.content[0]?.type === "text" ? hidden.content[0].text : "", /not found/i);

  const denied = await client.callTool({
    name: "create_record",
    arguments: { type: "note", area: "support", title: "Forbidden write", content: "No", owner: "alice" },
  });
  assert.equal(denied.isError, true);

  const created = await client.callTool({
    name: "create_record",
    arguments: { type: "note", area: "sales", title: "Allowed write", content: "Yes", owner: "alice" },
  });
  assert.equal(created.isError, undefined);
  assert.equal((await repository.search({ areas: ["support"] })).length, 1);
  assert.equal((await repository.search({ areas: ["sales"] })).length, 2);
});

test("public reads omit private and external identifiers", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-private-identifiers-"));
  const repository = new MarkdownRepository(root, "test-reference-hash-key");
  const record = await repository.createRecord({
    type: "note",
    area: "sales",
    title: "Imported context",
    content: "Approved public summary.",
    owner: "user_internal_123",
    externalRef: "provider:customer_987",
  });
  record.metadata.user_id = "user_internal_123";
  assert.doesNotMatch(publicMarkdown(record), /user_internal_123/);
  const access = new AccessContext("alice", "shared", [{ area: "sales", actions: ["read"] }]);
  const handler = createMcpHandler(() => buildMcpServer(repository, "direct", access, ["sales"]));
  const client = new Client(
    { name: "privacy-test", version: "0.1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  t.after(async () => {
    await client.close();
    await handler.close();
    await rm(root, { recursive: true, force: true });
  });

  await client.connect(transport);
  const fetched = await client.callTool({ name: "fetch", arguments: { id: record.metadata.id } });
  const serialized = JSON.stringify(fetched);
  assert.doesNotMatch(serialized, /user_internal_123/);
  assert.doesNotMatch(serialized, /customer_987/);
  assert.doesNotMatch(serialized, /external_ref/i);
  assert.match(serialized, /Approved public summary/);
  const privateSearch = await client.callTool({ name: "search", arguments: { query: "user_internal_123" } });
  assert.deepEqual((privateSearch.structuredContent as { results: unknown[] }).results, []);
});
