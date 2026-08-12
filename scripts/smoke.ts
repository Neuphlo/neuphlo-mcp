import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { TEMPLATE_NAME, TEMPLATE_VERSION } from "../src/version.js";

try {
  process.loadEnvFile(process.env.MCP_ENV_FILE ?? ".env");
} catch {}

const endpoint = new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp");
const authToken = process.env.NEUPHLO_MCP_AUTH_TOKEN?.trim();
const client = new Client(
  { name: `${TEMPLATE_NAME}-smoke-test`, version: TEMPLATE_VERSION },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint, {
    requestInit: authToken ? { headers: { authorization: `Bearer ${authToken}` } } : undefined,
  }));
  const tools = await client.listTools();
  const validation = await client.callTool({ name: "validate_repository", arguments: {} });
  console.log(JSON.stringify({
    endpoint: endpoint.href,
    protocolEra: client.getProtocolEra(),
    tools: tools.tools.map((tool) => tool.name),
    validation: validation.content,
  }, null, 2));
} finally {
  await client.close();
}
