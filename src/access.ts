import { readFile } from "node:fs/promises";
import YAML from "yaml";
import * as z from "zod/v4";
import type { KnowledgeRecord } from "./types.js";

const areaId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const action = z.enum(["read", "write"]);
const policySchema = z.object({
  version: z.literal(1),
  defaultArea: areaId.default("shared"),
  areas: z.array(z.object({ id: areaId, name: z.string().min(1).max(120) })).min(1),
  principals: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,127}$/),
    displayName: z.string().min(1).max(160).optional(),
    tokenSha256: z.string().regex(/^[a-f0-9]{64}$/),
    grants: z.array(z.object({
      area: z.union([areaId, z.literal("*")]),
      actions: z.array(action).min(1),
    })),
  })),
});

export type AccessAction = "read" | "write";
export type AccessPolicy = z.infer<typeof policySchema>;

export class AccessContext {
  readonly grants: ReadonlyMap<string, ReadonlySet<AccessAction>>;

  constructor(
    readonly principalId: string,
    readonly defaultArea: string,
    grants: Iterable<{ area: string; actions: Iterable<AccessAction> }>,
  ) {
    const map = new Map<string, Set<AccessAction>>();
    for (const grant of grants) {
      const current = map.get(grant.area) ?? new Set<AccessAction>();
      for (const value of grant.actions) current.add(value);
      map.set(grant.area, current);
    }
    this.grants = map;
  }

  areaOf(record: KnowledgeRecord): string {
    const area = record.metadata.area;
    return typeof area === "string" && area.length > 0 ? area : this.defaultArea;
  }

  can(area: string, requested: AccessAction): boolean {
    const allows = (actions?: ReadonlySet<AccessAction>) =>
      Boolean(actions?.has(requested) || (requested === "read" && actions?.has("write")));
    return allows(this.grants.get(area)) || allows(this.grants.get("*"));
  }

  canRead(record: KnowledgeRecord): boolean {
    return this.can(this.areaOf(record), "read");
  }

  get canWrite(): boolean {
    return [...this.grants.values()].some((actions) => actions.has("write"));
  }

  writableAreas(knownAreas: Iterable<string>): string[] {
    return [...knownAreas].filter((area) => this.can(area, "write"));
  }
}

export function wildcardAccess(principalId: string, actionValue: AccessAction, defaultArea = "shared"): AccessContext {
  return new AccessContext(principalId, defaultArea, [{ area: "*", actions: [actionValue] }]);
}

export async function loadAccessPolicy(policyPath: string | undefined): Promise<AccessPolicy | undefined> {
  if (!policyPath) return undefined;
  const policy = policySchema.parse(YAML.parse(await readFile(policyPath, "utf8")));
  const areas = new Set(policy.areas.map((area) => area.id));
  if (!areas.has(policy.defaultArea)) throw new Error(`Access policy defaultArea is not declared: ${policy.defaultArea}`);
  if (areas.size !== policy.areas.length) throw new Error("Access policy contains duplicate area IDs.");
  const principalIds = new Set<string>();
  const tokenHashes = new Set<string>();
  for (const principal of policy.principals) {
    if (principalIds.has(principal.id)) throw new Error(`Duplicate access policy principal: ${principal.id}`);
    if (tokenHashes.has(principal.tokenSha256)) throw new Error("Access policy token hashes must be unique.");
    principalIds.add(principal.id);
    tokenHashes.add(principal.tokenSha256);
    for (const grant of principal.grants) {
      if (grant.area !== "*" && !areas.has(grant.area)) throw new Error(`Principal ${principal.id} references unknown area: ${grant.area}`);
    }
  }
  return policy;
}
