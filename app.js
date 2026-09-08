import { digitsOnly, maskCpf, maskPhone, validatePayload } from "/lib/validation.mjs";

const form = document.querySelector("#sales-form");
const submitButton = document.querySelector("#submit-button");
const statusBox = document.querySelector("#form-status");
const startedAt = new Date().toISOString();
let submitting = false;
let recordsLoaded = false;
let records = [];

const field = (name) => form.elements.namedItem(name);

function setError(name, message = "") {
  const input = field(name);
  const output = document.querySelector(`#${name}-error`);
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
  if (output) output.textContent = message;
}

function showStatus(type, message) {
  statusBox.hidden = false;
  statusBox.className = `form-status ${type}`;
  statusBox.textContent = message;
  statusBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearStatus() {
  statusBox.hidden = true;
  statusBox.textContent = "";
  statusBox.className = "form-status";
}

function setLoading(active) {
  submitting = active;
  submitButton.disabled = active;
  submitButton.classList.toggle("is-loading", active);
  submitButton.querySelector(".button-label").textContent = active ? "Enviando…" : "Registrar venda";
}

field("numero_orcamento").addEventListener("input", (event) => { event.target.value = digitsOnly(event.target.value).slice(0, 12); });
field("cpf").addEventListener("input", (event) => { event.target.value = maskCpf(event.target.value); });
field("telefone").addEventListener("input", (event) => { event.target.value = maskPhone(event.target.value); });

for (const name of ["numero_orcamento", "cpf", "nome_titular", "telefone", "responsavel"]) {
  field(name).addEventListener("change", () => setError(name));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  clearStatus();

  const raw = Object.fromEntries(new FormData(form).entries());
  const validation = validatePayload(raw);
  for (const name of ["numero_orcamento", "cpf", "nome_titular", "telefone", "responsavel"]) {
    setError(name, validation.errors[name] ?? "");
  }
  if (!validation.ok) {
    showStatus("error", "Revise os campos destacados antes de enviar.");
    field(Object.keys(validation.errors)[0])?.focus();
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("/api/vendas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validation.data, company_website: raw.company_website, started_at: startedAt }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.message || "Não foi possível registrar agora. Tente novamente.");
    form.reset();
    showStatus("success", `Venda registrada com sucesso. Protocolo ${result.id}.`);
    recordsLoaded = false;
    field("numero_orcamento").focus();
  } catch (error) {
    showStatus("error", error instanceof Error ? error.message : "Não foi possível registrar agora. Tente novamente.");
  } finally {
    setLoading(false);
  }
});

const tabs = [...document.querySelectorAll(".tab-button")];
const panels = [...document.querySelectorAll(".view-panel")];
const recordsSearch = document.querySelector("#records-search");
const recordsBody = document.querySelector("#records-body");
const recordsCount = document.querySelector("#records-count");
const recordsStatus = document.querySelector("#records-status");
const recordsTableShell = document.querySelector("#records-table-shell");
const recordsEmpty = document.querySelector("#records-empty");
const refreshRecordsButton = document.querySelector("#refresh-records");
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateTimeFormatter.format(parsed);
}

function appendCell(row, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value || "—";
  if (className) cell.className = className;
  row.append(cell);
  return cell;
}

function renderRecords() {
  const query = normalizeSearch(recordsSearch.value.trim());
  const filtered = query
    ? records.filter((record) => normalizeSearch(Object.values(record).join(" ")).includes(query))
    : records;

  recordsBody.replaceChildren();
  for (const record of filtered) {
    const row = document.createElement("tr");
    appendCell(row, formatDateTime(record.created_at), "date-cell");
    appendCell(row, record.id, "numeric-cell");
    appendCell(row, record.numero_orcamento, "numeric-cell");
    appendCell(row, record.nome_titular);
    appendCell(row, record.cpf, "numeric-cell");
    appendCell(row, record.telefone, "numeric-cell");
    appendCell(row, record.responsavel);
    const statusCell = document.createElement("td");
    row.append(statusCell);
    const status = document.createElement("span");
    status.className = `status-pill ${record.status === "ANULADO" ? "is-cancelled" : "is-active"}`;
    status.textContent = record.status;
    statusCell.append(status);
    appendCell(row, formatDateTime(record.anulado_em), "date-cell");
    appendCell(row, record.motivo_anulacao);
    recordsBody.append(row);
  }

  const totalLabel = records.length === 1 ? "1 registro" : `${records.length} registros`;
  recordsCount.textContent = query ? `${filtered.length} de ${totalLabel}` : totalLabel;
  recordsTableShell.hidden = filtered.length === 0;
  recordsEmpty.hidden = filtered.length !== 0;
}

function showRecordsStatus(message) {
  recordsStatus.hidden = false;
  recordsStatus.className = "form-status error";
  recordsStatus.textContent = message;
  recordsTableShell.hidden = true;
  recordsEmpty.hidden = true;
}

async function loadRecords({ force = false } = {}) {
  if (recordsLoaded && !force) return;
  recordsLoaded = false;
  refreshRecordsButton.disabled = true;
  refreshRecordsButton.textContent = "Atualizando…";
  recordsStatus.hidden = true;
  recordsCount.textContent = "Carregando registros…";
  try {
    const response = await fetch("/api/vendas", { headers: { Accept: "application/json" }, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result?.records)) throw new Error(result?.message || "Não foi possível carregar os registros agora.");
    records = result.records;
    recordsLoaded = true;
    renderRecords();
  } catch (error) {
    recordsCount.textContent = "Listagem indisponível";
    showRecordsStatus(error instanceof Error ? error.message : "Não foi possível carregar os registros agora.");
  } finally {
    refreshRecordsButton.disabled = false;
    refreshRecordsButton.textContent = "Atualizar";
  }
}

async function activateTab(tab) {
  const panelId = tab.dataset.tab;
  for (const item of tabs) {
    const active = item === tab;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
    item.tabIndex = active ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.id !== panelId;
  if (panelId === "records-panel") await loadRecords();
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener("click", () => { void activateTab(tab); });
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    void activateTab(tabs[nextIndex]);
  });
}

recordsSearch.addEventListener("input", renderRecords);
refreshRecordsButton.addEventListener("click", () => { void loadRecords({ force: true }); });

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const controller = new AbortController();
  const schema = {
    type: "object",
    properties: {
      numero_orcamento: { type: "string", description: "Número do orçamento, somente dígitos." },
      cpf: { type: "string", description: "CPF do titular." },
      nome_titular: { type: "string", description: "Nome completo do titular." },
      telefone: { type: "string", description: "Telefone com DDD." },
      responsavel: { type: "string", enum: ["PATRICIA LIMA", "GIOVANNA SANTANA", "TATI SILVA"] },
    },
    required: ["numero_orcamento", "cpf", "nome_titular", "telefone", "responsavel"],
    additionalProperties: false,
  };
  void Promise.resolve(context.registerTool({
    name: "start_venda_administrativa",
    title: "Preparar venda administrativa",
    description: "Preenche e valida o formulário visível. Não envia nem grava a venda; o usuário ainda precisa revisar e clicar em Registrar venda.",
    inputSchema: schema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      const values = {
        numero_orcamento: digitsOnly(input?.numero_orcamento).slice(0, 12),
        cpf: maskCpf(input?.cpf),
        nome_titular: String(input?.nome_titular ?? ""),
        telefone: maskPhone(input?.telefone),
        responsavel: String(input?.responsavel ?? ""),
      };
      for (const [name, value] of Object.entries(values)) field(name).value = value;
      const validation = validatePayload(values);
      for (const name of Object.keys(values)) setError(name, validation.errors[name] ?? "");
      clearStatus();
      form.scrollIntoView({ block: "center", behavior: "smooth" });
      return { ready_for_review: validation.ok, invalid_fields: Object.keys(validation.errors) };
    },
  }, { signal: controller.signal })).catch(() => {});
}

registerWebMcp();
