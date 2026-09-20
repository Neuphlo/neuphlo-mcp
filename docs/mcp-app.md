# MCP App dashboard

The template implements the MCP Apps extension. A compatible host discovers `open_dashboard` or `show_knowledge_table`, reads the tool's `_meta.ui.resourceUri`, loads `ui://knowledge-workspace/dashboard-v1.html`, and renders the self-contained component in a sandboxed iframe.

The dashboard can:

- show only records and totals in the authenticated principal's readable areas;
- search and filter accessible Markdown records;
- display configured writable areas in the creation form;
- create standard or custom records only inside an authorized area;
- report vendor-neutral normalized-event input readiness; and
- render a result-specific table for comparison requests.

Area filtering in the UI is presentation only. The server independently filters every read and checks every write. A modified or unsupported client cannot bypass the policy.

Clients without MCP Apps support receive ordinary text and structured JSON results. No UI-only operation is required to retrieve or modify data.

| Request | Result |
|---|---|
| “Open the knowledge dashboard” | Accessible totals, recent records, and permitted write controls |
| “Show open Work as a table” | Accessible rows with stable IDs, area, status, owner, and date |
| Client without MCP Apps | Text and structured-data fallback |

The HTML, CSS, and client bridge live in `app/`. The server bundles them into `dist/ui/index.html` and serves that file as the MCP App resource. See [MCP UI authoring](mcp-ui-authoring.md) for extension patterns and [area access control](access-control.md) for the security contract.
