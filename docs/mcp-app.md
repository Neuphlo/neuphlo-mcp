# MCP App UI

For implementation steps and code examples, see [Authoring MCP UI Views](mcp-ui-authoring.md).

The Neuphlo MCP Template implements the official MCP Apps extension. A compatible host discovers the `open_neuphlo_dashboard` tool, sees its `_meta.ui.resourceUri`, reads `ui://neuphlo/mcp-template/main.html`, and renders the returned HTML in a sandboxed iframe.

The user-facing name comes from `MCP_APP_NAME`. It is returned in structured tool data and applied to the dashboard, inline table, resource title, and browser diagnostic page. The technical package/server identity remains stable so branding changes do not break client configuration.

## Included workflow

- Filter records by audience and updated date.
- Search the current dashboard view.
- Review totals across signals, insights, decisions, initiatives, releases, and briefs.
- Check Intercom, HubSpot, Chargebee, and generic connector readiness.
- Submit a new signal through the existing `submit_signal` MCP tool.
- Respect server `readonly` mode by disabling the capture form.
- Return a compact, horizontally scrollable inline table from `show_knowledge_table` when a user asks to list or compare records.

## Result-specific views

The MCP App is the rendering layer for a tool result, not merely a link to a standalone dashboard. For example:

| User request | Tool result in a compatible host |
|---|---|
| “Show recent customer insights in a table” | Filtered table with stable IDs, status, owner, updated date, and visibility |
| “Open the Neuphlo dashboard” | Example dashboard with filters, connector status, and signal capture |
| Client without MCP Apps support | Text summary and structured JSON fallback |

Additional views can use the same pattern later: release readiness cards, leadership risk summaries, decision timelines, and connector health tables.

The interface does not access the HTTP server directly. It calls MCP tools through the host's secure `postMessage` bridge, so authentication and future per-user permissions remain enforced on the server side.

## Compatibility

MCP Apps is an extension rather than a requirement of core MCP. The server therefore returns both:

- a short text result for clients without UI support; and
- structured dashboard data plus the linked MCP App for compatible clients.

The UI resource declares no external network or asset domains. Vite bundles its JavaScript and CSS into one HTML file during `npm run build`.

## Production permission requirement

The prototype UI displays the same records the current server exposes. Before real organizational data is added, authentication and record-level visibility filtering must be implemented in the repository queries and tool handlers. UI filtering alone is never an access-control boundary.
