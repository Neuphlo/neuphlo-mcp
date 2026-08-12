export interface ConnectorDescriptor {
  id: string;
  label: string;
  purpose: string;
  ingestion: "normalized-events" | "api-adapter-planned";
  secretEnvironmentVariables: string[];
}

export const connectors: ConnectorDescriptor[] = [
  {
    id: "intercom",
    label: "Intercom",
    purpose: "Conversations, tags, topics, and recurring support friction.",
    ingestion: "api-adapter-planned",
    secretEnvironmentVariables: ["INTERCOM_ACCESS_TOKEN"],
  },
  {
    id: "hubspot",
    label: "HubSpot",
    purpose: "Deal notes, objections, lost reasons, lifecycle changes, and company context.",
    ingestion: "api-adapter-planned",
    secretEnvironmentVariables: ["HUBSPOT_ACCESS_TOKEN"],
  },
  {
    id: "chargebee",
    label: "Chargebee",
    purpose: "Subscription changes, churn reasons, plan movements, and revenue-impact signals.",
    ingestion: "api-adapter-planned",
    secretEnvironmentVariables: ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY"],
  },
  {
    id: "generic",
    label: "Generic connector",
    purpose: "Normalized events from exports, webhooks, ETL tools, or custom adapters.",
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
