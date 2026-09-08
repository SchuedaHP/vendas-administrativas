import { validatePayload } from "../lib/validation.mjs";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
});

function reply(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function expectedHost(request) {
  return request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
}

export function originIsAllowed(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const host = expectedHost(request);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    return parsed.host === host && (parsed.protocol === "https:" || (local && parsed.protocol === "http:"));
  } catch {
    return false;
  }
}

function clientIp(request) {
  return (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
}

function looksLikeServiceKey(key) {
  if (!key || key.startsWith("sb_publishable_") || key.startsWith("sb_anon")) return false;
  if (!key.startsWith("eyJ")) return true;
  try {
    const raw = key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = raw.padEnd(raw.length + ((4 - (raw.length % 4)) % 4), "=");
    const decoded = JSON.parse(atob(payload));
    return decoded.role === "service_role";
  } catch {
    return false;
  }
}

export async function fingerprintFor(ip, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(ip));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function envConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const rateSecret = process.env.FORM_RATE_LIMIT_SECRET;
  if (!url || !looksLikeServiceKey(key) || !rateSecret || rateSecret.length < 32) return null;
  return { url, key, rateSecret };
}

export async function POST(request) {
  const requestId = crypto.randomUUID();
  if (!originIsAllowed(request)) return reply(403, { ok: false, message: "Origem da solicitação não autorizada." });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 8192) return reply(413, { ok: false, message: "Solicitação inválida." });

  let input;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8192) return reply(413, { ok: false, message: "Solicitação inválida." });
    input = JSON.parse(rawBody);
  } catch {
    return reply(400, { ok: false, message: "Solicitação inválida." });
  }

  if (String(input?.company_website || "").trim()) return reply(202, { ok: true, id: "recebido", created_at: new Date().toISOString() });
  const startedAt = Date.parse(input?.started_at || "");
  const elapsed = Date.now() - startedAt;
  if (!Number.isFinite(startedAt) || elapsed < 2500 || elapsed > 43_200_000) {
    return reply(400, { ok: false, message: "Recarregue a página e preencha o formulário novamente." });
  }

  const validation = validatePayload(input);
  if (!validation.ok) return reply(422, { ok: false, message: "Revise os campos informados." });
  const config = envConfig();
  if (!config) {
    console.error("vendas_administrativas_config_error", { requestId });
    return reply(503, { ok: false, message: "Serviço temporariamente indisponível. Tente novamente." });
  }

  try {
    const fingerprint = await fingerprintFor(clientIp(request), config.rateSecret);
    const response = await fetch(`${config.url}/rest/v1/rpc/registrar_venda_administrativa`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        p_numero_orcamento: validation.data.numero_orcamento,
        p_cpf: validation.data.cpf,
        p_nome_titular: validation.data.nome_titular,
        p_telefone: validation.data.telefone,
        p_responsavel: validation.data.responsavel,
        p_request_fingerprint: fingerprint,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const limited = response.status === 400 && body?.message === "limite_de_envios_excedido";
      console.error("vendas_administrativas_supabase_error", { requestId, status: response.status, code: body?.code || null });
      return reply(limited ? 429 : 502, { ok: false, message: limited ? "Limite de envios atingido. Aguarde antes de tentar novamente." : "Não foi possível registrar agora. Tente novamente." });
    }
    const record = Array.isArray(body) ? body[0] : body;
    if (!record?.id || !record?.created_at) throw new Error("unexpected_supabase_response");
    return reply(201, { ok: true, id: String(record.id), created_at: record.created_at });
  } catch (error) {
    console.error("vendas_administrativas_request_error", { requestId, name: error instanceof Error ? error.name : "unknown" });
    return reply(502, { ok: false, message: "Não foi possível registrar agora. Tente novamente." });
  }
}
