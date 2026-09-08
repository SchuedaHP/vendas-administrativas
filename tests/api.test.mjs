import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { POST } from "../api/vendas.mjs";

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
