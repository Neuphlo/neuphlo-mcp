import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { TEMPLATE_NAME, TEMPLATE_VERSION } from "../src/version.js";

const endpoint = new URL(process.env.MCP_URL ?? "http://localhost:3000/mcp");
const client = new Client(
  { name: `${TEMPLATE_NAME}-smoke-test`, version: TEMPLATE_VERSION },
  { versionNegotiation: { mode: { pin: "2026-07-28" } } },
);

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint));
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
