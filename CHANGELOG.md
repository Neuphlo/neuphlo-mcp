# Changelog

## Unreleased

- Add distinct read-only and read/write bearer credentials with server-enforced tool visibility.

## 0.2.0 — 2026-09-20

- Replace product-specific tools, views, URIs, environment variables, prompts, and examples with a neutral knowledge-workspace contract.
- Add canonical `search` and `fetch` tools plus `knowledge://` resources.
- Add generic `create_record` writes and custom record types without server code changes.
- Ship Rooms, Work, Pages, decisions, outcomes, and notes as the default collaboration profile, aligned with the current Neuphlo web model.
- Upgrade the MCP Apps UI SDK from 1.7.5 to 2.0.0.
- Use the MCP Apps 2 event-listener API for tool results and host-context changes.
- Refresh the dependency tree to remove reported npm audit vulnerabilities.

## 0.1.0 — 2026-08-12

Initial Neuphlo MCP Template release with Streamable HTTP, Docker, Markdown-backed resources, MCP Apps UI, content routing and validation, department examples, and connector contracts for Intercom, HubSpot, and Chargebee.
