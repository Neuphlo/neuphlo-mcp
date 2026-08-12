import assert from "node:assert/strict";
import { mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { connectors } from "../src/connectors.js";
import { MarkdownRepository } from "../src/repository.js";

test("catalogs Chargebee as an isolated API adapter", () => {
  const chargebee = connectors.find((connector) => connector.id === "chargebee");
  assert.equal(chargebee?.ingestion, "api-adapter-planned");
  assert.deepEqual(chargebee?.secretEnvironmentVariables, ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY"]);
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-template-"));
  const repository = new MarkdownRepository(root);
  await repository.ensureLayout();
  return { root, repository };
}

test("creates, reads, and searches a signal", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await repository.submitSignal({
    title: "Setup is confusing",
    summary: "Several customers cannot find the workspace configuration.",
    sourceType: "support",
    owner: "support-ops",
    domains: ["onboarding"],
    tags: ["friction"],
  });

  assert.match(String(created.metadata.id), /^SIG-\d{4}-001$/);
  assert.equal((await repository.getById(String(created.metadata.id)))?.metadata.title, "Setup is confusing");
  assert.equal((await repository.search({ query: "workspace configuration" })).length, 1);
  assert.equal((await repository.search({ domains: ["billing"] })).length, 0);
  assert.deepEqual(await repository.validate(), []);
});

test("connector imports are idempotent", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const event = {
    externalId: "conversation-42",
    summary: "A customer could not complete setup.",
    url: "https://example.test/conversations/42",
    confidence: "medium" as const,
  };
  const first = await repository.importConnectorEvents("intercom", [event], "support-ops");
  const second = await repository.importConnectorEvents("intercom", [event], "support-ops");

  assert.equal(first.created.length, 1);
  assert.equal(first.existing.length, 0);
  assert.equal(second.created.length, 0);
  assert.equal(second.existing.length, 1);
  assert.equal((await repository.listRecords()).length, 1);
});

test("routes and validates Markdown destinations", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.equal(repository.getDestination("decision", "dec-2026-001-example.md").relativePath, "decisions/dec-2026-001-example.md");

  const created = await repository.submitSignal({
    title: "Example signal",
    summary: "A concise observation.",
    sourceType: "support",
    owner: "support-ops",
  });
  const misplaced = path.join(root, "decisions", path.basename(created.path));
  await rename(path.join(root, created.path), misplaced);

  assert.match((await repository.validate())[0]?.message ?? "", /belongs in inbox\//);
});
