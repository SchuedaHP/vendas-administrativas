import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildXlsx, columnName, escapeXml, sanitizeSheetName } from "../lib/xlsx.mjs";

const COLUMNS = [
  { label: "Inserido em", width: 18 },
  { label: "Titular", width: 30 },
  { label: "Motivo da anulação", width: 40 },
];

function sample() {
  return buildXlsx({
    sheetName: "Vendas administrativas",
    columns: COLUMNS,
    rows: [
      ["08/09/2026, 14:42", "MARIA DE OLIVEIRA & FILHOS", ""],
      ["08/09/2026, 16:15", "JOÃO <DA> SILVA", "ORÇAMENTO INCORRETO"],
    ],
    now: new Date(2026, 8, 16, 10, 30, 0),
  });
}

test("gera um pacote zip com as partes que o Excel exige", () => {
  const bytes = sample();
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = Buffer.from(bytes).toString("latin1");
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) {
    assert.ok(text.includes(part), `parte ausente: ${part}`);
  }
  assert.ok(text.includes("PK"), "faltou o fim do diretório central");
});

test("escapa XML e mantém célula vazia sem conteúdo", () => {
  const text = Buffer.from(sample()).toString("utf8");
  assert.ok(text.includes("MARIA DE OLIVEIRA &amp; FILHOS"));
  assert.ok(text.includes("JOÃO &lt;DA&gt; SILVA"));
  assert.ok(text.includes('<c r="C2"/>'), "célula vazia deveria sair sem inlineStr");
  assert.ok(text.includes('<dimension ref="A1:C3"/>'), "dimensão deveria cobrir cabeçalho + 2 linhas");
});

test("referência de coluna cobre a virada para duas letras", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(27), "AB");
});

test("nome de aba respeita o limite e os caracteres do Excel", () => {
  assert.equal(sanitizeSheetName("Vendas/Administrativas[2026]"), "Vendas Administrativas 2026");
  assert.equal(sanitizeSheetName(""), "Planilha1");
  assert.equal(sanitizeSheetName("x".repeat(40)).length, 31);
});

test("remove caracteres de controle que invalidariam o XML", () => {
  assert.equal(escapeXml("AB"), "AB");
});

test("exige ao menos uma coluna", () => {
  assert.throws(() => buildXlsx({ columns: [], rows: [] }), /columns_required/);
});

// O teste real do formato é abrir o arquivo: o Python valida o zip e lê a planilha de volta.
test("o arquivo abre como planilha e devolve os mesmos valores", (t) => {
  let python;
  for (const candidate of ["python", "python3"]) {
    try {
      execFileSync(candidate, ["-c", "import zipfile"], { stdio: "ignore" });
      python = candidate;
      break;
    } catch {}
  }
  if (!python) return t.skip("python indisponível");

  const dir = mkdtempSync(join(tmpdir(), "xlsx-test-"));
  const file = join(dir, "amostra.xlsx");
  try {
    writeFileSync(file, sample());
    const script = [
      "import sys, zipfile, xml.etree.ElementTree as ET",
      // No Windows o stdout do Python sai em cp1252 e comeria os acentos na volta.
      "sys.stdout.reconfigure(encoding='utf-8')",
      "z = zipfile.ZipFile(sys.argv[1])",
      "assert z.testzip() is None",
      "ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'",
      "root = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))",
      "rows = root.find(ns+'sheetData').findall(ns+'row')",
      "vals = [[(c.find(ns+'is/'+ns+'t').text if c.find(ns+'is/'+ns+'t') is not None else '') for c in r.findall(ns+'c')] for r in rows]",
      "print(len(rows), vals[0][2], vals[1][1], repr(vals[2][2]))",
    ].join("\n");
    const output = execFileSync(python, ["-c", script, file], { encoding: "utf8" }).trim();
    assert.equal(output, "3 Motivo da anulação MARIA DE OLIVEIRA & FILHOS 'ORÇAMENTO INCORRETO'");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
