import assert from "node:assert/strict";
import { mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MarkdownRepository } from "../src/repository.js";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-template-"));
  const repository = new MarkdownRepository(root, "test-reference-hash-key");
  await repository.ensureLayout();
  return { root, repository };
}

test("creates, reads, and searches an extensible record", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  const created = await repository.createRecord({
    type: "work",
    area: "shared",
    title: "Setup is confusing",
    content: "Several people cannot find the workspace configuration.",
    owner: "support-ops",
    tags: ["onboarding", "friction"],
  });

  assert.equal(created.metadata.id, "shared-work-0001");
  assert.equal((await repository.getById(String(created.metadata.id)))?.metadata.title, "Setup is confusing");
  assert.equal((await repository.search({ query: "workspace configuration" })).length, 1);
  assert.equal((await repository.search({ tags: ["billing"] })).length, 0);
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
  const first = await repository.importConnectorEvents("external-system", "support", [event], "support-ops");
  const second = await repository.importConnectorEvents("external-system", "support", [event], "support-ops");

  assert.equal(first.created.length, 1);
  assert.equal(first.existing.length, 0);
  assert.equal(second.created.length, 0);
  assert.equal(second.existing.length, 1);
  assert.equal((await repository.listRecords()).length, 1);
  const stored = (await repository.listRecords())[0].raw;
  assert.doesNotMatch(stored, /conversation-42/);
  assert.doesNotMatch(stored, /example\.test/);
  assert.match(stored, /external_ref_hashes/);
});

test("routes and validates Markdown destinations", async (t) => {
  const { root, repository } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));

  assert.equal(repository.getDestination("decision", "shared", "decision-0001-example.md").relativePath, "areas/shared/decisions/decision-0001-example.md");

  const created = await repository.createRecord({
    type: "note",
    area: "shared",
    title: "Example note",
    content: "A concise observation.",
    owner: "support-ops",
  });
  const misplaced = path.join(root, "decisions", path.basename(created.path));
  await rename(path.join(root, created.path), misplaced);

  assert.deepEqual(await repository.validate(), []);
});
