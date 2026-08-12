import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { hostHeaderValidation, originValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { buildMcpServer } from "./server.js";
import { MarkdownRepository } from "./repository.js";
import { TEMPLATE_NAME, TEMPLATE_VERSION } from "./version.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const appName = process.env.MCP_APP_NAME?.trim() || "Documentation";
const contentRoot = path.resolve(process.env.NEUPHLO_MCP_CONTENT_ROOT ?? "content");
const writeMode = process.env.NEUPHLO_MCP_WRITE_MODE === "readonly" ? "readonly" : "direct";
const allowedHosts = (process.env.NEUPHLO_MCP_ALLOWED_HOSTS ?? "localhost,127.0.0.1,[::1],neuphlo-mcp")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT: ${process.env.PORT}`);

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const repository = new MarkdownRepository(contentRoot);
await repository.ensureLayout();

const mcpHandler = createMcpHandler(() => buildMcpServer(repository, writeMode));
const nodeMcpHandler = toNodeHandler(mcpHandler, {
  onerror: (error) => console.error("MCP adapter error", error),
});
const validateHost = hostHeaderValidation(allowedHosts);
const validateOrigin = originValidation(allowedHosts);
const documentationRoutes: Record<string, string> = {
  "/readme.md": path.resolve(process.cwd(), "README.md"),
  "/customizing.md": path.resolve(process.cwd(), "CUSTOMIZING.md"),
  "/docs/mcp-ui-authoring.md": path.resolve(process.cwd(), "docs/mcp-ui-authoring.md"),
  "/docs/mcp-app.md": path.resolve(process.cwd(), "docs/mcp-app.md"),
  "/docs/connectors.md": path.resolve(process.cwd(), "docs/connectors.md"),
  "/docs/starter-blueprint.md": path.resolve(process.cwd(), "docs/starter-blueprint.md"),
  "/docs/governance.md": path.resolve(process.cwd(), "docs/governance.md"),
  "/content/readme.md": path.resolve(process.cwd(), "content/README.md"),
  "/changelog.md": path.resolve(process.cwd(), "CHANGELOG.md"),
};

const browserHelp = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(appName)}</title>
  <style>
    :root{font-family:ui-sans-serif,system-ui,sans-serif;color-scheme:light dark;--bg:#fdfdfc;--card:#fff;--ink:#111827;--muted:#6b7280;--accent:#12b5a6;--accent-hover:#2bd4c3;--accent-soft:#12b5a61f;--warm:#fe6e00;--line:#d1d5db}
    @media(prefers-color-scheme:dark){:root{--bg:#1f1f1e;--card:#262626;--ink:#ececec;--muted:#a1a1a1;--accent:#2bd4c3;--accent-hover:#12b5a6;--accent-soft:#12b5a629;--warm:#fe6e00;--line:#333}}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 8% 0%,#12b5a62e,transparent 30%),radial-gradient(circle at 96% 8%,#fe6e001f,transparent 26%),var(--bg);color:var(--ink)}main{width:min(920px,calc(100% - 32px));margin:5vh auto;padding:34px;border:1px solid var(--line);border-radius:20px;background:var(--card);box-shadow:0 1px 2px #0000000a,0 2px 6px #0000000f}
    .status{display:inline-flex;align-items:center;gap:8px;color:var(--accent);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.1em}.dot{width:9px;height:9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}h1{font-family:Georgia,serif;font-size:42px;font-weight:500;letter-spacing:-.03em;margin:18px 0 12px}h2{margin:34px 0 10px;font-size:20px}h3{margin:0 0 8px;font-size:14px}p,li,td{color:var(--muted);line-height:1.6}code{padding:3px 6px;border-radius:6px;background:var(--bg);color:var(--ink)}.endpoint{display:flex;justify-content:space-between;gap:12px;margin:24px 0;padding:14px;border:1px solid var(--line);border-radius:12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{padding:16px;border:1px solid var(--line);border-radius:12px;text-decoration:none;font-weight:400}.card:hover{border-color:var(--accent);background:var(--accent-soft)}.card p{margin:0;font-size:13px}table{width:100%;border-collapse:collapse;margin:12px 0 24px;font-size:13px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--ink)}a{color:var(--accent);font-weight:700}a:hover{color:var(--accent-hover)}.section-intro{max-width:760px;margin:0 0 18px;color:var(--muted);font-size:14px;line-height:1.65}.section-intro a{white-space:nowrap}strong{color:var(--ink)}
    .terminal{overflow:hidden;border:1px solid #3a3f45;border-radius:14px;background:#171918;box-shadow:0 12px 30px #0000001f;color:#ececec}.terminal-bar{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:11px 14px;border-bottom:1px solid #303332;background:#222524}.terminal-dots{display:flex;gap:6px}.terminal-dots span{width:8px;height:8px;border-radius:50%;background:#525252}.terminal-dots span:first-child{background:#ff5f57}.terminal-dots span:nth-child(2){background:#febc2e}.terminal-dots span:last-child{background:#28c840}.terminal-title{color:#a1a1a1;font-size:11px;font-weight:700;letter-spacing:.04em}.terminal-badge{justify-self:end;padding:3px 7px;border:1px solid #3a3f45;border-radius:999px;color:#717171;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.command-list{display:grid;margin:0;padding:10px 0;list-style:none}.command-list li{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 16px}.command-list li:hover{background:#ffffff08}.command-list li::before{content:"$";color:var(--accent);font:800 13px ui-monospace,SFMono-Regular,Menlo,monospace}.command-list code{overflow:auto;padding:0;background:transparent;color:#f5f5f5;font:600 13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.command-note{color:#717171;font-size:10px;font-weight:650}
    @media(max-width:680px){main{padding:22px}.grid{grid-template-columns:1fr}.endpoint{display:grid}h1{font-size:34px}.command-note{display:none}.command-list li{grid-template-columns:16px minmax(0,1fr)}}
  </style>
</head>
<body><main>
  <div class="status"><span class="dot"></span>MCP server is running · v${TEMPLATE_VERSION}</div>
  <h1>${escapeHtml(appName)}</h1>
  <p>This address is a protocol endpoint, not the MCP App itself. A compatible MCP host calls a tool, reads its <code>ui://</code> resource, and renders the returned component inline.</p>
  <div class="endpoint"><span>MCP endpoint</span><strong>http://localhost:${port}/mcp</strong></div>
  <h2>Customize this template</h2>
  <div class="grid">
    <section class="card"><h3>Name and runtime</h3><p>Edit <code>.env</code>, <code>compose.yaml</code>, and <code>Dockerfile</code>.</p></section>
    <section class="card"><h3>Tools and data</h3><p>Edit <code>src/server.ts</code>, <code>src/types.ts</code>, and <code>src/repository.ts</code>.</p></section>
    <section class="card"><h3>Inline MCP UI</h3><p>Edit <code>app/index.html</code>, <code>app/src.ts</code>, and <code>app/style.css</code>.</p></section>
  </div>
  <h2>Common changes</h2>
  <table><thead><tr><th>Change</th><th>Where</th></tr></thead><tbody>
    <tr><td>Visible application name</td><td><code>MCP_APP_NAME</code> in <code>.env</code></td></tr>
    <tr><td>Add a tool, resource, prompt, or UI result</td><td><code>src/server.ts</code></td></tr>
    <tr><td>Change Markdown record types and templates</td><td><code>src/types.ts</code> and <code>content/_templates/</code></td></tr>
    <tr><td>Choose where Markdown is stored</td><td><code>MCP_CONTENT_DIR</code> in <code>.env</code></td></tr>
    <tr><td>Add connector configuration</td><td><code>src/connectors.ts</code>, <code>.env.example</code>, and <code>compose.yaml</code></td></tr>
    <tr><td>Add authentication and access filtering</td><td>HTTP request context plus every tool/resource query</td></tr>
  </tbody></table>
  <h2 id="build-and-verify">Build and verify</h2>
  <section class="terminal" aria-label="Build and verification commands">
    <header class="terminal-bar">
      <span class="terminal-dots" aria-hidden="true"><span></span><span></span><span></span></span>
      <span class="terminal-title">Local setup</span>
      <span class="terminal-badge">5 steps</span>
    </header>
    <ol class="command-list">
      <li><code>npm run check</code><span class="command-note">Type-check</span></li>
      <li><code>npm run build</code><span class="command-note">Build server + UI</span></li>
      <li><code>npm test</code><span class="command-note">Run automated tests</span></li>
      <li><code>docker compose up -d --build</code><span class="command-note">Start the container</span></li>
      <li><code>npm run smoke</code><span class="command-note">Verify MCP transport</span></li>
    </ol>
  </section>
  <h2>Documentation</h2>
  <p class="section-intro">Everything you need to make this template your own lives in the repository. Start with the <a href="/readme.md">README and quick-start guide</a>, then use your coding agent to add tools, connect services, reshape the MCP UI, or customize the content and workflows to fit your product.</p>
  <div class="grid">
    <a class="card" href="/content/readme.md"><h3>Content placement</h3><p>Choose the storage location and route each Markdown record type to the correct folder.</p></a>
    <a class="card" href="/customizing.md"><h3>Customization manual</h3><p>Complete map for branding, tools, resources, data, connectors, permissions, testing, and deployment.</p></a>
    <a class="card" href="/docs/mcp-ui-authoring.md"><h3>MCP UI authoring</h3><p>Add or adjust inline tables, cards, dashboards, structured results, HTML, CSS, and CSP.</p></a>
    <a class="card" href="/docs/mcp-app.md"><h3>MCP App architecture</h3><p>How the current UI resource, result-specific views, compatibility, and permissions fit together.</p></a>
    <a class="card" href="/docs/connectors.md"><h3>Connector architecture</h3><p>Normalized ingestion and adapter boundaries for Intercom, HubSpot, Chargebee, and other sources.</p></a>
    <a class="card" href="/docs/starter-blueprint.md"><h3>Template blueprint</h3><p>The example Markdown information model, MCP surface, rollout phases, and success measures.</p></a>
    <a class="card" href="/docs/governance.md"><h3>Governance example</h3><p>Ownership, cadence, writing rules, triage outcomes, and definitions of current records.</p></a>
  </div>
</main></body></html>`;

const httpServer = createServer(async (req, res) => {
  const acceptsHtml = req.headers.accept?.includes("text/html") ?? false;
  if ((req.url === "/" || req.url === "/mcp") && req.method === "GET" && acceptsHtml) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    });
    res.end(browserHelp);
    return;
  }
  if (req.method === "GET" && req.url && documentationRoutes[req.url]) {
    const documentationPath = documentationRoutes[req.url];
    try {
      const markdown = await readFile(documentationPath, "utf8");
      res.writeHead(200, {
        "content-type": "text/markdown; charset=utf-8",
        "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
      });
      res.end(markdown);
    } catch {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "documentation_not_found" }));
    }
    return;
  }
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", name: TEMPLATE_NAME, version: TEMPLATE_VERSION, writeMode }));
    return;
  }
  if (req.url !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  await nodeMcpHandler(req, res);
});

httpServer.listen(port, host, () => {
  console.log(`${appName} MCP listening on http://${host}:${port}/mcp`);
  console.log(`Content root: ${contentRoot}; write mode: ${writeMode}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    mcpHandler.close();
    httpServer.close(() => process.exit(0));
  });
}
