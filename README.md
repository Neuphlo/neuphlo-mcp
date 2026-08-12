# Neuphlo MCP Template

Current release: **0.1.0**. See the [changelog](CHANGELOG.md) for the release scope.

The Neuphlo starter repository for building modern Model Context Protocol servers with:

- MCP SDK V2 and the `2026-07-28` protocol revision;
- Streamable HTTP with stateless legacy compatibility;
- MCP Apps that render inline tables and dashboards in compatible hosts;
- Docker and Docker Compose setup;
- Markdown-backed example resources and write tools;
- normalized connector examples for Intercom, HubSpot, Chargebee, and future sources;
- validation, tests, health checks, and a smoke client.

The included signals, insights, decisions, initiatives, releases, and briefs form an opinionated example module. Replace or simplify them when adapting the starter to another domain.

Start with [Customizing the Neuphlo MCP Template](CUSTOMIZING.md). The focused references cover the [starter blueprint](docs/starter-blueprint.md), [MCP UI authoring](docs/mcp-ui-authoring.md), [MCP App architecture](docs/mcp-app.md), and [connector architecture](docs/connectors.md).

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

Choose the name shown to users by editing `.env`:

```env
MCP_APP_NAME=Your Application Name
```

Choose where Markdown is stored on the host:

```env
MCP_CONTENT_DIR=./content
```

This can be a repository-relative or absolute directory. Docker mounts it at `/data/content`; the server then routes each record type to its designated subfolder. See the [content placement guide](content/README.md) before adding or generating records.

For a clean slate, set `MCP_CONTENT_DIR` to a new empty directory. The server creates the expected folder structure automatically while leaving the included examples available for reference. The [content placement guide](content/README.md#start-with-a-clean-slate) also explains how to remove only the sample records when retaining the default directory.

Then apply it with `docker compose up -d`. No source-code rename is required. The npm package and MCP server retain the technical starter identity, while the diagnostic page, MCP resource title, dashboard, and inline table use `MCP_APP_NAME`.

- MCP endpoint: `http://localhost:3000/mcp`
- Health endpoint: `http://localhost:3000/healthz`
- Browser diagnostic: `http://localhost:3000/mcp`

Compose exposes the service on localhost and bind-mounts `content/`, so rebuilding does not remove Markdown records.

Verify modern protocol negotiation, tool discovery, and repository validation:

```bash
npm install
npm run smoke
```

Stop the stack with `docker compose down`. For development without Docker, run `npm install` followed by `npm run dev`.

The server reads `.env` itself, so `npm run dev` and `npm start` pick up the same file Compose uses. Real environment variables take precedence over the file, and `MCP_ENV_FILE` points at a different one.

## Bearer token authentication

Set `NEUPHLO_MCP_AUTH_TOKEN` to require `Authorization: Bearer <token>` on every route. Unauthenticated requests get a `401` with a `WWW-Authenticate` header, and the token is compared as a SHA-256 digest so the check does not leak length or content through timing.

`/healthz` is the one exception, and only from loopback: the container health check reaches it over `127.0.0.1` inside the container, while proxied and published traffic arrives from the bridge network and still needs the token. An exposed deployment therefore reveals nothing through the health endpoint.

```bash
openssl rand -hex 32
```

Leave the variable empty and the server accepts every request, which is only appropriate for a loopback-bound development run. Set it before putting the endpoint on any network. `npm run smoke` reads the same variable and sends the header for you.

A single shared token authenticates the caller but says nothing about which records they may read. Per-user identity and record-level authorization still have to be added before real data goes in.

## Starter capabilities

- MCP Apps: `open_neuphlo_dashboard` returns the example dashboard and `show_knowledge_table` returns a result-specific inline table.
- Resources: bundled MCP App HTML, Markdown index, individual records, and connector catalog.
- Read tools: `search_knowledge`, `get_record`, `validate_repository`, and `build_brief`.
- Write tools: `submit_signal` and idempotent `import_connector_events`.
- Prompt: `triage-signals`.
- Storage: human-readable Markdown with YAML frontmatter.

Clients without MCP Apps support receive ordinary text and structured JSON results. The UI is bundled into one self-contained HTML resource with no separate web server or external scripts.

## Repository layout

```text
app/                 MCP App source
content/             Example Markdown records and templates
docs/                Architecture and customization guidance
scripts/             Smoke client
src/                 MCP server and Markdown repository
test/                Protocol and repository tests
Dockerfile           Production image
compose.yaml         Local starter stack
```

## Customize the starter

1. Set `MCP_APP_NAME` for user-facing branding; change protocol identifiers in `src/server.ts` only if your integration requires it.
2. Replace the example record types and templates under `content/`.
3. Adapt the MCP App in `app/` to the structured results your tools return.
4. Remove unused connector descriptors or add isolated adapter services.
5. Add authentication and server-side authorization before importing real data.
6. Prefer proposal/review writes or `NEUPHLO_MCP_WRITE_MODE=readonly` in shared environments.

The example content workflow uses stable IDs, ownership, review dates, audiences, domains, and sensitivity metadata to demonstrate patterns—not to prescribe a universal information model.

For step-by-step instructions on changing the existing HTML or adding a new inline table, card, chart, or dedicated `ui://` resource, see [Authoring MCP UI Views](docs/mcp-ui-authoring.md).
