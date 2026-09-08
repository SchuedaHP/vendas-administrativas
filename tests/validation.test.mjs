import test from "node:test";
import assert from "node:assert/strict";
import { isValidCpf, maskCpf, normalizePhone, validatePayload } from "../lib/validation.mjs";

test("valida CPF e rejeita repetição ou excesso de dígitos", () => {
  assert.equal(isValidCpf("529.982.247-25"), true);
  assert.equal(isValidCpf("111.111.111-11"), false);
  assert.equal(isValidCpf("152998224725"), false);
  assert.equal(maskCpf("52998224725"), "529.982.247-25");
});

test("normaliza telefone com DDI e insere nono dígito no fixo de 10 dígitos", () => {
  assert.equal(normalizePhone("+55 (11) 98765-4321"), "11987654321");
  assert.equal(normalizePhone("(11) 8765-4321"), "11987654321");
  assert.equal(normalizePhone("123"), "");
});

test("normaliza e valida todos os campos", () => {
  const result = validatePayload({
    numero_orcamento: "000123",
    cpf: "529.982.247-25",
    nome_titular: "  João   da Silva ",
    telefone: "(11) 98765-4321",
    responsavel: "PATRICIA LIMA",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    numero_orcamento: "123",
    cpf: "52998224725",
    nome_titular: "JOÃO DA SILVA",
    telefone: "11987654321",
    responsavel: "PATRICIA LIMA",
  });
});
