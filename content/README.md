# Content placement

Set the host storage directory in `.env`:

```env
MCP_CONTENT_DIR=./content
```

Docker mounts that directory at `/data/content`. The server reads `NEUPHLO_MCP_CONTENT_ROOT=/data/content` inside the container.

Place each Markdown record according to its `type` frontmatter:

| `type` | Destination |
|---|---|
| `signal` | `inbox/` |
| `customer-insight` | `customer-insights/` |
| `initiative` | `initiatives/` |
| `decision` | `decisions/` |
| `release` | `releases/` |
| `brief` | `briefs/` |

Use the matching file in `_templates/` when creating a record manually. Agents can call `get_content_destination` before writing and `validate_repository` afterward. Server-created signals and connector imports are routed to `inbox/` automatically.

The included records are deliberately short examples. Replace or remove them when adapting the template.

## Start with a clean slate

The safest option is to leave the examples intact and point the server at a new empty directory:

```env
MCP_CONTENT_DIR=./my-content
```

Apply the change with `docker compose up -d`. The server creates the required record folders automatically, and the original examples remain available under `content/` for reference.

To keep using `MCP_CONTENT_DIR=./content`, delete the example `.md` files inside `inbox/`, `customer-insights/`, `initiatives/`, `decisions/`, `releases/`, and `briefs/`. Keep `README.md` and `_templates/`. Run `npm run smoke` afterward to confirm that the empty repository is valid.

## Department examples

| Department | Example | Why it is useful |
|---|---|---|
| Support | `inbox/sig-2026-001-import-progress-is-unclear.md` | Turns recurring conversations into a neutral signal. |
| Sales | `inbox/sig-2026-002-enterprise-buyers-request-audit-history.md` | Captures a repeated buying requirement without promising a feature. |
| Marketing | `inbox/sig-2026-003-buyers-confuse-automation-and-integrations.md` | Records a messaging observation and a validation step. |
| Product and Engineering | `decisions/dec-2026-001-standard-import-states.md` | Shares an implementation-relevant decision and rationale. |
| Leadership | `briefs/brf-2026-002-leadership-weekly-summary.md` | Summarizes cross-department changes without duplicating detailed records. |
