export interface ConnectorDescriptor {
  id: string;
  label: string;
  purpose: string;
  ingestion: "normalized-events";
  secretEnvironmentVariables: string[];
}

export const connectors: ConnectorDescriptor[] = [
  {
    id: "normalized-events",
    label: "Normalized event input",
    purpose: "Vendor-neutral events from exports, webhooks, automation, or external adapters.",
    ingestion: "normalized-events",
    secretEnvironmentVariables: [],
  },
];

export function publicConnectorStatus(): Array<ConnectorDescriptor & { configured: boolean }> {
  return connectors.map((connector) => ({
    ...connector,
    configured:
      connector.secretEnvironmentVariables.length === 0 ||
      connector.secretEnvironmentVariables.every((name) => Boolean(process.env[name])),
  }));
}
