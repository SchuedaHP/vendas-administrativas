import { digitsOnly, maskCpf, maskPhone, validatePayload } from "/lib/validation.mjs";

const form = document.querySelector("#sales-form");
const submitButton = document.querySelector("#submit-button");
const statusBox = document.querySelector("#form-status");
const startedAt = new Date().toISOString();
let submitting = false;

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
    field("numero_orcamento").focus();
  } catch (error) {
    showStatus("error", error instanceof Error ? error.message : "Não foi possível registrar agora. Tente novamente.");
  } finally {
    setLoading(false);
  }
});

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
