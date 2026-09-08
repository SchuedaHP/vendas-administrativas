export const RESPONSAVEIS = Object.freeze([
  "PATRICIA LIMA",
  "GIOVANNA SANTANA",
  "TATI SILVA",
]);

export function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeBudget(value) {
  return digitsOnly(value).replace(/^0+(?=\d)/, "");
}

export function normalizeCpf(value) {
  const cpf = digitsOnly(value);
  return cpf.length <= 11 ? cpf.padStart(11, "0") : cpf;
}

export function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function normalizePhone(value) {
  let phone = digitsOnly(value);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith("55")) phone = phone.slice(2);
  if (phone.length === 10) phone = `${phone.slice(0, 2)}9${phone.slice(2)}`;
  return /^\d{11}$/.test(phone) ? phone : "";
}

export function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

export function validatePayload(input) {
  const data = {
    numero_orcamento: normalizeBudget(input?.numero_orcamento),
    cpf: normalizeCpf(input?.cpf),
    nome_titular: normalizeName(input?.nome_titular),
    telefone: normalizePhone(input?.telefone),
    responsavel: normalizeName(input?.responsavel),
  };
  const errors = {};
  if (!/^\d{1,12}$/.test(data.numero_orcamento)) errors.numero_orcamento = "Informe somente os dígitos do orçamento.";
  if (!isValidCpf(data.cpf)) errors.cpf = "Informe um CPF válido com 11 dígitos.";
  if (data.nome_titular.length < 3 || data.nome_titular.length > 150) errors.nome_titular = "Informe o nome completo do titular.";
  if (!data.telefone) errors.telefone = "Informe um telefone válido com DDD.";
  if (!RESPONSAVEIS.includes(data.responsavel)) errors.responsavel = "Selecione uma responsável válida.";
  return { ok: Object.keys(errors).length === 0, data, errors };
}

export function maskCpf(value) {
  const d = digitsOnly(value).slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskPhone(value) {
  const d = digitsOnly(value).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
