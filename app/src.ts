import { App, applyDocumentTheme } from "@modelcontextprotocol/ext-apps/app-with-deps";
import { TEMPLATE_VERSION } from "../src/version.js";
import "./style.css";

type DashboardRecord = {
  id?: string;
  type?: string;
  title?: string;
  status?: string;
  updated?: string;
  sensitivity?: string;
  excerpt?: string;
};

type DashboardData = {
  view: "dashboard";
  appName: string;
  generatedAt: string;
  audience: string;
  writeMode: "readonly" | "direct";
  records: DashboardRecord[];
  totals: Record<string, number>;
  connectors: Array<{ id: string; label: string; purpose: string; configured: boolean }>;
};

type TableData = {
  view: "knowledge-table";
  appName: string;
  title: string;
  description: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string>>;
};

type AppData = DashboardData | TableData;

const app = new App({ name: "MCP App", version: TEMPLATE_VERSION }, {});
const elements = {
  audience: document.querySelector<HTMLSelectElement>("#audience")!,
  since: document.querySelector<HTMLInputElement>("#since")!,
  query: document.querySelector<HTMLInputElement>("#query")!,
  refresh: document.querySelector<HTMLButtonElement>("#refresh")!,
  stats: document.querySelector<HTMLElement>("#stats")!,
  records: document.querySelector<HTMLElement>("#records")!,
  count: document.querySelector<HTMLElement>("#record-count")!,
  connectors: document.querySelector<HTMLElement>("#connectors")!,
  form: document.querySelector<HTMLFormElement>("#signal-form")!,
  formStatus: document.querySelector<HTMLElement>("#form-status")!,
  connection: document.querySelector<HTMLElement>("#connection-label")!,
  dashboardView: document.querySelector<HTMLElement>("#dashboard-view")!,
  tableView: document.querySelector<HTMLElement>("#table-view")!,
  tableTitle: document.querySelector<HTMLElement>("#table-title")!,
  tableDescription: document.querySelector<HTMLElement>("#table-description")!,
  tableCount: document.querySelector<HTMLElement>("#table-count")!,
  tableHead: document.querySelector<HTMLElement>("#table-head")!,
  tableBody: document.querySelector<HTMLElement>("#table-body")!,
  tableEmpty: document.querySelector<HTMLElement>("#table-empty")!,
  dashboardTitle: document.querySelector<HTMLElement>("#dashboard-view h1")!,
  dashboardEyebrow: document.querySelector<HTMLElement>("#dashboard-view .eyebrow")!,
  tableEyebrow: document.querySelector<HTMLElement>("#table-view .eyebrow")!,
};

elements.since.value = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function structured(result: { structuredContent?: unknown }): AppData | undefined {
  const value = result.structuredContent;
  return value && typeof value === "object" && "view" in value ? value as AppData : undefined;
}

function renderDashboard(data: DashboardData): void {
  elements.dashboardView.hidden = false;
  elements.tableView.hidden = true;
  document.title = data.appName;
  elements.dashboardTitle.textContent = data.appName;
  elements.dashboardEyebrow.textContent = "Workspace";
  const query = elements.query.value.trim().toLocaleLowerCase();
  const records = data.records.filter((record) =>
    !query || `${record.id} ${record.type} ${record.title} ${record.excerpt}`.toLocaleLowerCase().includes(query),
  );
  const statOrder = ["signal", "customer-insight", "decision", "initiative", "release", "brief"];
  elements.stats.innerHTML = statOrder.map((type) => `
    <article class="stat">
      <strong>${data.totals[type] ?? 0}</strong>
      <span>${escapeHtml(type.replace("-", " "))}${(data.totals[type] ?? 0) === 1 ? "" : "s"}</span>
    </article>`).join("");
  elements.count.textContent = `${records.length} shown`;
  elements.records.innerHTML = records.length ? records.map((record) => `
    <article class="record">
      <div class="record-topline">
        <span class="type type-${escapeHtml(record.type)}">${escapeHtml(record.type?.replace("-", " "))}</span>
        <span class="sensitivity">${escapeHtml(record.sensitivity ?? "internal")}</span>
      </div>
      <h3>${escapeHtml(record.title)}</h3>
      <p>${escapeHtml(record.excerpt || "No summary available.")}</p>
      <footer><code>${escapeHtml(record.id)}</code><span>${escapeHtml(record.status)}</span><time>${escapeHtml(record.updated)}</time></footer>
    </article>`).join("") : `<div class="empty"><strong>No matching records</strong><span>Try another audience, date, or search phrase.</span></div>`;
  elements.connectors.innerHTML = data.connectors.map((connector) => `
    <article class="connector">
      <span class="connector-mark ${connector.configured ? "configured" : "planned"}"></span>
      <div><strong>${escapeHtml(connector.label)}</strong><p>${escapeHtml(connector.purpose)}</p></div>
      <small>${connector.configured ? "Ready" : "Adapter planned"}</small>
    </article>`).join("");
  elements.form.querySelectorAll("input, textarea, select, button").forEach((control) => {
    (control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement).disabled = data.writeMode === "readonly";
  });
}

function renderTable(data: TableData): void {
  elements.dashboardView.hidden = true;
  elements.tableView.hidden = false;
  document.title = data.appName;
  elements.tableEyebrow.textContent = data.appName;
  elements.tableTitle.textContent = data.title;
  elements.tableDescription.textContent = data.description;
  elements.tableCount.textContent = `${data.rows.length} ${data.rows.length === 1 ? "record" : "records"}`;
  elements.tableHead.innerHTML = `<tr>${data.columns.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join("")}</tr>`;
  elements.tableBody.innerHTML = data.rows.map((row) => `<tr>${data.columns.map((column) => {
    const value = row[column.key] ?? "";
    const className = column.key === "status" ? "cell-status" : column.key === "id" ? "cell-id" : "";
    return `<td class="${className}">${escapeHtml(value)}</td>`;
  }).join("")}</tr>`).join("");
  elements.tableEmpty.hidden = data.rows.length > 0;
  elements.tableBody.closest(".table-scroll")?.toggleAttribute("hidden", data.rows.length === 0);
}

function render(data: AppData): void {
  if (data.view === "knowledge-table") renderTable(data);
  else renderDashboard(data);
}

async function refresh(): Promise<void> {
  elements.refresh.disabled = true;
  elements.connection.textContent = "Updating";
  try {
    const result = await app.callServerTool({
      name: "open_neuphlo_dashboard",
      arguments: {
        audience: elements.audience.value,
        since: elements.since.value || undefined,
      },
    });
    const data = structured(result);
    if (!data || data.view !== "dashboard") throw new Error("The dashboard returned no structured data.");
    render(data);
    elements.connection.textContent = "Connected";
  } catch (error) {
    elements.connection.textContent = "Unavailable";
    elements.records.innerHTML = `<div class="empty error"><strong>Could not refresh</strong><span>${escapeHtml(error instanceof Error ? error.message : error)}</span></div>`;
  } finally {
    elements.refresh.disabled = false;
  }
}

app.ontoolresult = (result) => {
  const data = structured(result);
  if (data) render(data);
};

app.onhostcontextchanged = ({ theme }) => {
  if (theme) applyDocumentTheme(theme);
};

elements.refresh.addEventListener("click", refresh);
elements.audience.addEventListener("change", refresh);
elements.since.addEventListener("change", refresh);
elements.query.addEventListener("input", () => {
  window.clearTimeout(Number(elements.query.dataset.timer ?? 0));
  elements.query.dataset.timer = String(window.setTimeout(refresh, 180));
});
elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = new FormData(elements.form);
  elements.formStatus.textContent = "Saving…";
  try {
    const result = await app.callServerTool({
      name: "submit_signal",
      arguments: {
        title: String(values.get("title") ?? ""),
        summary: String(values.get("summary") ?? ""),
        sourceType: String(values.get("sourceType") ?? "internal"),
        owner: String(values.get("owner") ?? ""),
        evidenceLinks: [],
        domains: [],
        tags: ["submitted-from-ui"],
        sensitivity: "internal",
        confidence: "medium",
      },
    });
    if (result.isError) throw new Error("The server rejected the signal.");
    elements.form.reset();
    elements.form.querySelector<HTMLInputElement>("[name=owner]")!.value = "workspace-owner";
    elements.formStatus.textContent = "Added to the triage inbox.";
    await refresh();
  } catch (error) {
    elements.formStatus.textContent = error instanceof Error ? error.message : "Could not save the signal.";
  }
});

await app.connect();
const context = app.getHostContext();
if (context?.theme) applyDocumentTheme(context.theme);
elements.connection.textContent = "Connected";
