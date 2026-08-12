import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildMcpServer } from "../src/server.js";
import { MarkdownRepository } from "../src/repository.js";

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
  assert.ok(tools.tools.some((tool) => tool.name === "import_connector_events"));
  const hubTool = tools.tools.find((tool) => tool.name === "open_neuphlo_dashboard");
  assert.deepEqual(hubTool?._meta, {
    ui: { resourceUri: "ui://neuphlo/mcp-template/main.html" },
    "ui/resourceUri": "ui://neuphlo/mcp-template/main.html",
  });

  const resources = await client.listResources();
  assert.ok(resources.resources.some((resource) => resource.uri === "ui://neuphlo/mcp-template/main.html"));
  const appResource = await client.readResource({ uri: "ui://neuphlo/mcp-template/main.html" });
  const appContent = appResource.contents[0];
  assert.equal(appContent?.mimeType, "text/html;profile=mcp-app");
  assert.ok(appContent && "text" in appContent);
  assert.match(appContent && "text" in appContent ? appContent.text : "", /Documentation/);

  const dashboard = await client.callTool({
    name: "open_neuphlo_dashboard",
    arguments: { audience: "support" },
  });
  assert.equal((dashboard.structuredContent as { audience?: string })?.audience, "support");
  assert.equal((dashboard.structuredContent as { appName?: string })?.appName, "Documentation");

  const table = await client.callTool({
    name: "show_knowledge_table",
    arguments: { audience: "leadership" },
  });
  assert.equal((table.structuredContent as { view?: string })?.view, "knowledge-table");
  assert.ok(Array.isArray((table.structuredContent as { columns?: unknown[] })?.columns));

  const result = await client.callTool({ name: "validate_repository", arguments: {} });
  assert.equal(result.isError, undefined);
  const firstBlock = result.content[0];
  assert.equal(firstBlock?.type, "text");
  assert.deepEqual(JSON.parse(firstBlock?.type === "text" ? firstBlock.text : "{}"), { valid: true, issues: [] });
});
