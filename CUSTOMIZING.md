# Customizing the Neuphlo MCP Template

This is the main handoff guide for turning the Neuphlo MCP Template into a specific MCP server. Generated files under `dist/` and installed packages under `node_modules/` should never be edited directly.

## Quick customization map

| Goal | Edit |
|---|---|
| Change the user-facing application name | `.env` → `MCP_APP_NAME` |
| Change tools, resources, prompts, or structured results | `src/server.ts` |
| Change HTTP runtime behavior | `src/index.ts` |
| Change record types or shared TypeScript contracts | `src/types.ts` |
| Change Markdown reading, search, validation, or writes | `src/repository.ts` |
| Change the inline MCP App HTML | `app/index.html` |
| Change MCP App behavior and result rendering | `app/src.ts` |
| Change MCP App presentation | `app/style.css` |
| Change the browser starter-page presentation | CSS inside `src/index.ts` (`browserHelp`) |
| Change or add Markdown templates | `content/_templates/` |
| Add connector descriptors | `src/connectors.ts` |
| Add live connector workers | New isolated service plus `compose.yaml` |
| Change ports, volumes, secrets, or services | `.env`, `compose.yaml`, and `Dockerfile` |
| Change automated verification | `test/` and `scripts/smoke.ts` |

## 1. Create local configuration

Copy the example without committing secrets:

```bash
cp .env.example .env
```

Important settings:

```env
MCP_PORT=3000
MCP_APP_NAME=Your Application Name
MCP_CONTENT_DIR=./content
NEUPHLO_MCP_WRITE_MODE=direct
NEUPHLO_MCP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1],neuphlo-mcp
NEUPHLO_MCP_AUTH_TOKEN=
NEUPHLO_MCP_LOG_IPS=false
```

`MCP_APP_NAME` is the visible customer/application name. Changing it does not change stable MCP identifiers.

`MCP_CONTENT_DIR` is the host directory mounted into the container. It accepts a repository-relative path such as `./content` or an absolute path such as `/srv/company-knowledge`. Record types are routed to subfolders inside that directory; see [`content/README.md`](content/README.md).

Use `NEUPHLO_MCP_WRITE_MODE=readonly` when a deployment should expose only read tools. The example write tools remain discoverable but return an error instead of changing Markdown.

`NEUPHLO_MCP_AUTH_TOKEN` gates every route behind `Authorization: Bearer <token>`, with `/healthz` exempt only for loopback callers so the container health check keeps working. Set it whenever the endpoint leaves loopback. It is a single shared secret, so treat it as the outer door rather than as per-user authorization.

Every request is logged as one line: method, path, status, and duration. Query strings are stripped so a credential passed as a parameter cannot reach the log, and headers and bodies are never logged. Client IP addresses are omitted unless `NEUPHLO_MCP_LOG_IPS=true`, since on a public deployment they are personal data and the retention policy is the operator's to choose.

Apply environment changes with:

```bash
docker compose up -d
```

A source-code or dependency change requires a rebuild:

```bash
docker compose up -d --build
```

## 2. Decide whether to keep the example domain

The repository includes an optional knowledge-sharing example:

```text
Signal → Customer insight → Initiative → Decision → Release → Brief
```

You may:

- keep the model unchanged;
- rename and adapt the record types;
- remove some record types; or
- replace the module entirely while retaining the MCP, Docker, UI, and testing foundation.

When changing the model, update these together:

1. `src/types.ts` — allowed record types and interfaces.
2. `src/repository.ts` — directories, validation, search, and write behavior.
3. `content/_templates/` — authoring formats and frontmatter.
4. `src/server.ts` — tool schemas and returned structured data.
5. `app/src.ts` — UI result types and renderers.
6. `test/` — new contract and behavior expectations.
7. Documentation describing the resulting domain.

Keep stable IDs in canonical records. Filenames may change; external references and MCP resource links should use IDs.

## 3. Add or change an MCP tool

Tools are registered in `buildMcpServer()` inside `src/server.ts`.

```ts
server.registerTool(
  "get_example",
  {
    title: "Get an example",
    description: "Explain clearly when the model should call this tool.",
    inputSchema: z.object({ id: z.string().min(1) }),
    annotations: { readOnlyHint: true },
  },
  async ({ id }) => ({
    content: [{ type: "text", text: `Loaded ${id}` }],
    structuredContent: { id },
  }),
);
```

Guidelines:

- Use stable snake-case tool names.
- Describe when the model should call the tool, not merely what the code does.
- Validate every argument with Zod.
- Mark read-only, idempotent, and destructive behavior accurately.
- Return useful text for clients without MCP Apps support.
- Filter permissions before constructing the result.
- Add a protocol test that calls the tool through an MCP client.

Renaming an existing tool is a breaking protocol change for clients, prompts, tests, and UI code that refer to it.

## 4. Add or change an MCP resource

Resources are also registered in `src/server.ts`:

```ts
server.registerResource(
  "example-index",
  "neuphlo://examples",
  { title: "Example index", mimeType: "application/json" },
  async uri => ({
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify({ examples: [] }),
    }],
  }),
);
```

Use `ResourceTemplate` for IDs or other URI variables. Resource callbacks must enforce the same authorization rules as tools; an obscure URI is not access control.

## 5. Add or change a prompt

Prompts live near the tools they orchestrate in `src/server.ts`. Treat prompts as reusable workflow instructions rather than hidden business logic. Tool and repository rules must still enforce validation, permissions, and safe writes.

After changing prompts, verify discovery with an MCP client and review the generated message text for missing constraints.

## 6. Build inline MCP UI

The bundled MCP App is under `app/`. It uses a stable `view` discriminator in `structuredContent` to decide whether to render a dashboard, table, card, or another component.

The complete implementation tutorial is [Authoring MCP UI Views](docs/mcp-ui-authoring.md). It covers:

- editing the existing HTML and CSS;
- adding a result-specific view;
- linking tools through `_meta.ui.resourceUri`;
- creating a separate `ui://` HTML resource;
- calling tools from the iframe;
- CSP and escaping untrusted data;
- visual and protocol verification.

The minimum UI-linked tool configuration is:

```ts
_meta: {
  ui: {
    resourceUri: "ui://neuphlo/mcp-template/main.html",
  },
}
```

The tool should return both forms:

```ts
return {
  content: [{ type: "text", text: "Fallback for non-UI clients" }],
  structuredContent: {
    view: "your-view",
    appName,
    items: [],
  },
};
```

Do not fetch the `/mcp` endpoint from inside the app. Use `app.callServerTool()` so the host mediates the request and the server enforces identity and permissions.

## 7. Add a connector

Connector descriptors in `src/connectors.ts` are examples and configuration indicators. They do not perform live synchronization.

For a new source:

1. Add its descriptor and required secret names to `src/connectors.ts`.
2. Add empty secret placeholders to `.env.example` and `compose.yaml`.
3. Document the allowlisted fields, redaction policy, cursor, retry behavior, and event mapping.
4. Normalize source records into the `ConnectorEvent` contract.
5. Submit them through the idempotent import path.
6. Add deduplication and mapping tests.

For production synchronization, create a separate worker or scheduled job. Keep broad vendor API credentials away from the public MCP request service when possible.

See [Connector Architecture](docs/connectors.md) for the normalized event contract and Intercom, HubSpot, and Chargebee examples.

## 8. Add identity and authorization

The template does not yet provide production authentication or per-record authorization. Add both before importing real organizational data.

A production authorization layer should:

1. authenticate each MCP request;
2. map the principal to groups or scopes;
3. filter records before search, list, resource read, brief generation, and UI structured data;
4. authorize every write and lifecycle transition;
5. record actor, client, reason, and timestamp;
6. avoid exposing restricted record existence through counts or error messages.

`audiences` controls relevance. `sensitivity` and allowed groups should control access. UI filtering is never permission enforcement.

Private personal Markdown should live outside the configured content root and preferably in a separate repository or storage boundary.

## 9. Rename technical identifiers

Most adopters only need `MCP_APP_NAME`. Change the technical Neuphlo identifiers only when publishing a distinct server product or when URI ownership requires it.

Technical identifiers include:

- npm package name in `package.json` and `package-lock.json`;
- MCP server name in `src/server.ts`;
- `ui://neuphlo/mcp-template/...` resource URIs;
- `neuphlo://...` knowledge resource URIs;
- tool names such as `open_neuphlo_dashboard`;
- Docker service name in `compose.yaml`;
- `NEUPHLO_MCP_*` environment-variable names;
- tests, documentation, and smoke-client identity.

Find every branded identifier before and after changing it:

```bash
rg -n -i 'neuphlo|NEUPHLO_MCP' \
  -g '!node_modules/**' \
  -g '!dist/**'
```

Then regenerate the lockfile and run the full verification sequence:

```bash
npm install --package-lock-only
npm run check
npm run build
npm test
docker compose down --remove-orphans
docker compose up -d --build
npm run smoke
```

Changing URI or tool identifiers can break already configured clients. Prefer a versioned migration when the server has real users.

## 10. Build, test, and deploy

### Local Node development

```bash
npm install
npm run dev
```

### Static and automated verification

```bash
npm run check
npm run build
npm test
```

### Docker verification

```bash
docker compose up -d --build
npm run smoke
docker compose ps
```

`npm run smoke` is an optional deployed-server check. It confirms that a real MCP client can negotiate the modern protocol, discover tools, and call a validation tool against the running container. It does not render the MCP App.

### Generated output

`npm run build` creates compiled server code and a single-file MCP App under `dist/`. Rebuild instead of editing generated output.

## 11. Pre-production checklist

- [ ] `MCP_APP_NAME` is set for the deployment.
- [ ] Tool descriptions and schemas match actual behavior.
- [ ] Obsolete example tools, templates, and connectors are removed.
- [ ] Authentication is enabled.
- [ ] Authorization is enforced in tools and resources before result construction.
- [ ] Sensitive connector fields are allowlisted and redacted.
- [ ] Writes are read-only or review-based unless direct writes are intentional.
- [ ] Secrets are supplied by a secret store and are absent from Git.
- [ ] Markdown storage has backup, retention, and concurrency plans.
- [ ] MCP App CSP allows only required origins.
- [ ] Text fallback works without MCP Apps.
- [ ] Desktop, mobile, light, and dark UI states are verified.
- [ ] `npm run check`, `npm run build`, `npm test`, and `npm run smoke` pass.
- [ ] The container is healthy and bound to the intended interface.
- [ ] Dependency audit findings are reviewed.

## Related documentation

- [README](README.md) — setup and repository overview
- [MCP UI authoring](docs/mcp-ui-authoring.md) — HTML and inline component tutorial
- [MCP App architecture](docs/mcp-app.md) — current view behavior and compatibility
- [Connector architecture](docs/connectors.md) — source integration boundary
- [Template blueprint](docs/starter-blueprint.md) — example domain and rollout model
- [Governance](docs/governance.md) — example content ownership and lifecycle rules
