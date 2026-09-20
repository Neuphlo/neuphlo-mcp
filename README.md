# neuphlo-mcp

A reusable MCP 2.x server for shared Markdown knowledge. It gives people and agents a durable source of truth, canonical search/fetch tools, safe optional writes, resources, connector ingestion, and an MCP Apps dashboard. Neuphlo maintains the project; the exposed tools, views, URIs, environment variables, and content model are vendor-neutral.

## What ships out of the box

- Standard collaboration records: Rooms, Work, Pages, decisions, outcomes, and notes.
- Extensible business records: any safe lowercase type works without a code change.
- Canonical `search` and `fetch` tools for agent knowledge retrieval.
- `open_dashboard` and `show_knowledge_table` MCP Apps views, with useful text/JSON fallbacks.
- `create_record`, `get_record`, `search_knowledge`, `build_summary`, and repository validation.
- Idempotent normalized event ingestion, with vendor adapters kept outside the knowledge model.
- `knowledge://index`, `knowledge://records/{id}`, and `knowledge://connectors` resources.
- Streamable HTTP using the modern MCP `2026-07-28` protocol era.

The collaboration defaults align with the current `neuphlo-web` everyday model while remaining ordinary Markdown concepts. A business can add types such as `incident`, `policy`, `campaign`, or `customer` alongside them.

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
cp .env.example .env
npm run build
npm test
npm start
```

The default endpoint is `http://localhost:3000/mcp`. The landing page is available at `http://localhost:3000/`.

## Configuration

```dotenv
MCP_PORT=3000
MCP_APP_NAME=Documentation
MCP_CONTENT_ROOT=./content
MCP_WRITE_MODE=readonly
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,[::1],knowledge-mcp
MCP_LOG_IPS=false
MCP_AUTH_TOKEN=
```

Use `readonly` until you deliberately want `create_record` and connector imports to write files. Set a strong bearer token before exposing the endpoint outside a trusted local environment. Production deployments still need an authorization layer that filters every tool and resource read to the caller's permitted records.

## Record format

```markdown
---
id: work-0001
type: work
title: Prepare the launch
status: open
owner: workspace-owner
created: 2026-09-20T00:00:00.000Z
updated: 2026-09-20T00:00:00.000Z
sensitivity: internal
tags: [launch]
room_id: room-0001
---

The Markdown body contains the durable context.
```

Required fields are `id`, `type`, `title`, `status`, `owner`, `created`, and `updated`. Frontmatter may contain arbitrary business metadata. Custom record types are stored in a directory matching the type.

## Compatibility

The server registers MCP Apps resources using `_meta.ui.resourceUri` and retains the legacy flat metadata key for compatible hosts. Clients without UI support still receive useful text and structured content. The canonical `search`/`fetch` pair follows the company-knowledge convention used by ChatGPT integrations.

`neuphlo-web` can register this server as an external MCP service, discover its tools/resources, invoke tools, and read resources. Neuphlo's own workspace MCP endpoint remains responsible for authenticated native operations such as reading Rooms or creating Work; this reusable server does not pretend a Markdown directory has those backend permissions.

## Development

```bash
npm run check
npm test
npm run build
npm run smoke
```

See [CUSTOMIZING.md](CUSTOMIZING.md) for extension guidance and [docs/mcp-ui-authoring.md](docs/mcp-ui-authoring.md) for additional MCP Apps views.
