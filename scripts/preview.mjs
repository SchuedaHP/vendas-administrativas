import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = new URL("../", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const port = Number(process.env.PORT || 4173);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

http.createServer(async (req, res) => {
  if (req.url === "/api/vendas" && req.method === "POST") {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: false, message: "Prévia local: o envio será habilitado após configurar a Vercel." }));
    return;
  }
  const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const safe = normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  if (safe.startsWith("api") || safe.startsWith("sql") || safe.startsWith("tests") || safe.startsWith("scripts") || safe.startsWith(".")) {
    res.writeHead(404); res.end("Not found"); return;
  }
  try {
    const data = await readFile(join(root, safe));
    res.writeHead(200, { "Content-Type": mime[extname(safe)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Não encontrado");
  }
}).listen(port, "127.0.0.1", () => console.log(`Prévia: http://127.0.0.1:${port}`));
