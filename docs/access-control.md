# Area and person access control

The server supports data-driven areas and per-person bearer credentials. Areas are not compiled into the application: adding Sales, Support, Legal, or another department requires policy and content changes, not new TypeScript code or MCP tools.

## Security model

Every request resolves to a principal. Every record belongs to an `area`. Every operation is evaluated as:

```text
principal + area + action(read|write) -> allow or deny
```

The checks are applied to resource listing and reads, `search`, `fetch`, dashboards, tables, summaries, validation, content destinations, record creation, and connector imports. A principal cannot discover an inaccessible record through search, totals, resource lists, validation paths, or direct ID lookup. Direct lookup of an inaccessible ID returns the same not-found result as a missing ID.

`write` implies `read` for the same area. Missing grants deny access. Records without `area` are treated as the configured `defaultArea` for migration, but validation reports the missing field so they can be corrected.

## Record buckets

New records contain an explicit area and are stored below that area's directory:

```markdown
---
id: sales-work-0042
type: work
area: sales
title: Prepare enterprise renewal
status: open
owner: alice@example.com
created: 2026-09-20T08:00:00.000Z
updated: 2026-09-20T08:00:00.000Z
---
```

```text
content/areas/sales/work/sales-work-0042-prepare-enterprise-renewal.md
```

The directory is useful for human navigation; authorization is based on validated metadata and is always enforced by the server.

## Create a local policy

Copy the non-secret example. The destination is ignored by Git:

```bash
cp config/access-policy.example.yaml config/access-policy.yaml
chmod 600 config/access-policy.yaml
```

Point the server at it:

```dotenv
MCP_ACCESS_POLICY_PATH=./config/access-policy.yaml
```

The policy declares areas and individual principals:

```yaml
version: 1
defaultArea: shared

areas:
  - id: shared
    name: Shared workspace
  - id: sales
    name: Sales
  - id: support
    name: Support

principals:
  - id: alice@example.com
    displayName: Alice
    tokenSha256: 64-lowercase-hex-characters
    grants:
      - area: sales
        actions: [read, write]
      - area: shared
        actions: [read]
```

Area IDs use lowercase letters, numbers, and hyphens. Principal IDs are stable audit identities and must be unique. Token hashes and principal IDs must also be unique.

## Give one person a credential

Generate a different token for every person. Give the plaintext token to that person through an approved secret channel and retain only its hash:

```bash
PERSON_TOKEN=$(openssl rand -hex 32)
printf '%s\n' "$PERSON_TOKEN"
printf '%s' "$PERSON_TOKEN" | sha256sum
unset PERSON_TOKEN
```

Place the 64-character hash in `tokenSha256`, restart the service, and configure the person's MCP client with:

```text
Authorization: Bearer <their-personal-token>
```

Do not email tokens, place plaintext tokens in the policy, or commit them. Rotate a credential by generating a new token, replacing its hash, restarting, and securely delivering the new value. Revoke a person by removing the principal or all grants and restarting.

## Keep a person in their own bucket

For a Sales-only writer, grant only Sales:

```yaml
grants:
  - area: sales
    actions: [read, write]
```

That principal can search, read, and create Sales records. Support records are absent from every result, and a write specifying `area: support` is rejected. No deny rule is needed because the policy fails closed.

Cross-department read access remains explicit:

```yaml
grants:
  - area: sales
    actions: [read, write]
  - area: development
    actions: [read]
```

Wildcard grants are intended for carefully controlled administrators or service integrations:

```yaml
grants:
  - area: "*"
    actions: [read]
```

The global `MCP_READ_TOKEN` and `MCP_WRITE_TOKEN` are backward-compatible wildcard service credentials. Do not distribute the global write token to ordinary people.

## Add a department

Add the area and then grant it to selected principals:

```yaml
areas:
  - id: customer-success
    name: Customer Success
```

```yaml
grants:
  - area: customer-success
    actions: [read, write]
```

Restart the service after policy changes. No source-code change, database migration, new MCP tool, or new UI view is required.

## Docker

Mount the private policy read-only and set its container path in a Compose override:

```yaml
services:
  neuphlo-mcp:
    environment:
      MCP_ACCESS_POLICY_PATH: /run/neuphlo/access-policy.yaml
    volumes:
      - ./config/access-policy.yaml:/run/neuphlo/access-policy.yaml:ro
```

The policy file is the starter provider. A future database, Neuphlo identity service, or OAuth integration can construct the same principal grants without changing record authorization semantics.
