import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GET, POST, recordForDisplay, sanitizeHint } from "../api/vendas.mjs";

const valid = () => ({
  numero_orcamento: "123",
  cpf: "52998224725",
  nome_titular: "JOÃO DA SILVA",
  telefone: "11987654321",
  responsavel: "PATRICIA LIMA",
  company_website: "",
  started_at: new Date(Date.now() - 3000).toISOString(),
});

function request(body = valid(), headers = {}) {
  return new Request("http://localhost/api/vendas", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost", "x-forwarded-for": "10.0.0.8", ...headers },
    body: JSON.stringify(body),
  });
}

function configure() {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret-for-test";
  process.env.FORM_RATE_LIMIT_SECRET = "12345678901234567890123456789012";
}

test("sucesso devolve somente protocolo e horário, sem PII", async () => {
  configure();
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify([{ id: 42, created_at: "2026-09-08T12:00:00Z" }]), { status: 200 });
  };
  try {
    const response = await POST(request());
    const text = await response.text();
    assert.equal(response.status, 201);
    assert.match(text, /"id":"42"/);
    for (const pii of ["52998224725", "11987654321", "JOÃO DA SILVA", "PATRICIA LIMA"]) assert.equal(text.includes(pii), false);
    assert.equal(sent.p_cpf, "52998224725");
    assert.match(sent.p_request_fingerprint, /^[0-9a-f]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("origem inválida, preenchimento rápido e dados inválidos são bloqueados", async () => {
  configure();
  assert.equal((await POST(request(valid(), { origin: "https://evil.example" }))).status, 403);
  assert.equal((await POST(request({ ...valid(), started_at: new Date().toISOString() }))).status, 400);
  assert.equal((await POST(request({ ...valid(), cpf: "11111111111" }))).status, 422);
});

test("erro de rede é genérico e não repete PII", async () => {
  configure();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  try {
    const response = await POST(request());
    const text = await response.text();
    assert.equal(response.status, 502);
    assert.equal(text.includes("52998224725"), false);
    assert.equal(text.includes("11987654321"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("interface contém trava contra duplo clique", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /if \(submitting\) return;/);
  assert.match(source, /submitButton\.disabled = active/);
});

test("consulta mascara PII e preserva os campos de conferência", () => {
  assert.deepEqual(recordForDisplay({
    id: 7,
    created_at: "2026-09-08T15:00:00Z",
    numero_orcamento: "123",
    cpf: "52998224725",
    nome_titular: "JOÃO DA SILVA",
    telefone: "11987654321",
    responsavel: "PATRICIA LIMA",
    status: "ATIVO",
    anulado_em: null,
    motivo_anulacao: null,
    request_fingerprint: "segredo",
  }), {
    id: "7",
    created_at: "2026-09-08T15:00:00Z",
    numero_orcamento: "123",
    nome_titular: "JOÃO DA SILVA",
    cpf: "***.***.247-25",
    telefone: "(11) *****-4321",
    responsavel: "PATRICIA LIMA",
    status: "ATIVO",
    anulado_em: null,
    motivo_anulacao: null,
  });
});

test("consulta pede registros em ordem decrescente e nunca devolve PII bruto", async () => {
  configure();
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify([{
      id: 8,
      created_at: "2026-09-08T16:00:00Z",
      numero_orcamento: "456",
      cpf: "52998224725",
      nome_titular: "MARIA TESTE",
      telefone: "11987654321",
      responsavel: "TATI SILVA",
      status: "ATIVO",
      anulado_em: null,
      motivo_anulacao: null,
    }]), { status: 200 });
  };
  try {
    const response = await GET();
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(requestedUrl, /order=created_at\.desc,id\.desc/);
    assert.equal(text.includes("52998224725"), false);
    assert.equal(text.includes("11987654321"), false);
    assert.match(text, /\*\*\*\.\*\*\*\.247-25/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---- Trava de orcamento duplicado (David, 11/09/2026) ----

function supabaseDuplicado(hint) {
  return async () => new Response(JSON.stringify({
    code: "P0001", message: "orcamento_ja_cadastrado", details: null, hint,
  }), { status: 400 });
}

test("orçamento já cadastrado devolve 409 com a mensagem do banco", async () => {
  configure();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = supabaseDuplicado(
    "O orcamento 4669586 ja foi cadastrado por TATI SILVA em 05/08/2026 09:12.");
  try {
    const response = await POST(request());
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.campo, "numero_orcamento");
    assert.match(body.message, /ja foi cadastrado por TATI SILVA/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicado sem hint utilizável cai na mensagem genérica, nunca vaza o payload do banco", async () => {
  configure();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = supabaseDuplicado('<script>alert("x")</script>');
  try {
    const response = await POST(request());
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.message, "Este número de orçamento já tem um cadastro ativo.");
    assert.doesNotMatch(body.message, /script/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("duplicado não é confundido com o limite de envios", async () => {
  configure();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: "P0001", message: "limite_de_envios_excedido", hint: null,
  }), { status: 400 });
  try {
    const response = await POST(request());
    assert.equal(response.status, 429);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitizeHint recusa texto longo, com marcação ou vazio", () => {
  assert.equal(sanitizeHint("Orcamento 123 ja cadastrado por TATI SILVA em 05/08/2026 09:12."),
               "Orcamento 123 ja cadastrado por TATI SILVA em 05/08/2026 09:12.");
  assert.equal(sanitizeHint("<b>oi</b>"), "");
  assert.equal(sanitizeHint("x".repeat(241)), "");
  assert.equal(sanitizeHint(null), "");
  assert.equal(sanitizeHint("linha um\nlinha dois"), "linha um linha dois");
});
