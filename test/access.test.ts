import assert from "node:assert/strict";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AccessContext, loadAccessPolicy } from "../src/access.js";

test("loads the example area policy", async () => {
  const policy = await loadAccessPolicy(path.resolve("config/access-policy.example.yaml"));
  assert.equal(policy?.defaultArea, "shared");
  assert.ok(policy?.areas.some((area) => area.id === "sales"));
  assert.ok(policy?.principals.some((principal) => principal.id === "alice@example.com"));
});

test("write grants imply read only inside the granted area", () => {
  const access = new AccessContext("alice", "shared", [{ area: "sales", actions: ["write"] }]);
  assert.equal(access.can("sales", "read"), true);
  assert.equal(access.can("sales", "write"), true);
  assert.equal(access.can("support", "read"), false);
  assert.equal(access.can("support", "write"), false);
});

test("rejects grants for undeclared areas", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "neuphlo-mcp-policy-"));
  const target = path.join(root, "policy.yaml");
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(target, `
version: 1
defaultArea: shared
areas:
  - id: shared
    name: Shared
principals:
  - id: alice
    tokenSha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
    grants:
      - area: missing
        actions: [read]
`);
  await assert.rejects(loadAccessPolicy(target), /unknown area/);
});
