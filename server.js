import { spawn } from "node:child_process";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer, request as requestHttp } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const python = join(repo, "intel", ".venv", "bin", "python");
const root = fileURLToPath(new URL("./public", import.meta.url));
const template = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const catalogs = {
  en: flatten(JSON.parse(readFileSync(new URL("./i18n/en.json", import.meta.url), "utf8"))),
  de: flatten(JSON.parse(readFileSync(new URL("./i18n/de.json", import.meta.url), "utf8"))),
};
const port = Number(process.env.PORT) || 4321;
const host = "0.0.0.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
};

const headers = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'sha256-FJR/orTSJTq3alyvd+VLS1zXQp4+vRtMta3TUnlJpC8='; worker-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; object-src 'self'; base-uri 'none'; frame-ancestors 'none'",
};

function publicFile(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) return null;
  const full = resolve(root, pathname.replace(/^\/+/, ""));
  const prefix = root.endsWith(sep) ? root : root + sep;
  if (full !== root && !full.startsWith(prefix)) return null;
  return full;
}

function flatten(value, prefix = "", out = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return out;
  }
  out[prefix] = String(value);
  return out;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render(source, lang) {
  const flat = catalogs[lang] ?? catalogs.en;
  return source.replace(/\{\{([a-zA-Z0-9.]+)\}\}/g, (match, key) => {
    if (!Object.hasOwn(flat, key)) return match;
    return escapeHtml(flat[key]);
  });
}

function pageLanguage(pathname) {
  if (pathname === "/de" || pathname === "/de/") return "de";
  if (pathname === "/" || pathname === "/index.html") return "en";
  return null;
}

function errorLanguage(pathname) {
  if (pathname === "/de" || pathname.startsWith("/de/")) return "de";
  return "en";
}

function notFound(lang) {
  return render(`<!doctype html>
<html lang="{{html.lang}}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{missing.title}} — Robin Prause</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="page missing">
    <p class="kicker">{{missing.kicker}}</p>
    <h1>{{missing.title}}<br><em>{{missing.emph}}</em></h1>
    <p class="lede"><a href="{{home}}">{{missing.back}}</a></p>
  </main>
</body>
</html>`, lang);
}

function deskDown(body) {
  let lang = "en";
  try {
    const payload = JSON.parse(body.toString());
    if (payload && payload.lang === "de") lang = "de";
  } catch {
    lang = "en";
  }
  const answer = catalogs[lang]["chat.down"] ?? catalogs.en["chat.down"];
  return JSON.stringify({ answer, sources: [] });
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { ...headers, "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

function startDesk() {
  if (!existsSync(python)) {
    console.log("profile desk skipped: intel/.venv is missing");
    return;
  }
  const child = spawn(python, ["-m", "personal.chatd"], {
    cwd: repo,
    env: { ...process.env, PYTHONPATH: repo },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code) => {
    console.log(`profile desk exited ${code ?? "null"}`);
  });
}

function forwardAsk(req, res) {
  const chunks = [];
  let size = 0;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > 8_000) {
      res.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const upstream = requestHttp(
      {
        hostname: "127.0.0.1",
        port: 4322,
        path: "/ask",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": body.length },
      },
      (response) => {
        res.writeHead(response.statusCode ?? 502, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-cache",
          "X-Content-Type-Options": "nosniff",
        });
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) {
        send(res, 503, deskDown(body), "application/json; charset=utf-8");
      }
    });
    upstream.end(body);
  });
}

const server = createServer((req, res) => {
  if (!req.url) {
    send(res, 400, "Bad request");
    return;
  }
  const pathname = req.url.split("?")[0];
  if (pathname === "/ask" && req.method === "POST") {
    forwardAsk(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  const language = pageLanguage(pathname);
  if (language) {
    const body = render(template, language);
    res.writeHead(200, {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Language": language,
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-cache",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
    return;
  }

  const path = publicFile(req.url);
  if (!path) {
    send(res, 400, "Bad request");
    return;
  }

  let file = path;
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    const info = statSync(file);
    if (!info.isFile()) {
      send(res, 404, notFound(errorLanguage(pathname)), "text/html; charset=utf-8");
      return;
    }
    const ext = extname(file).toLowerCase();
    const type = types[ext] ?? "application/octet-stream";
    const cache = ext === ".html" || ext === ".css" ? "no-cache" : "public, max-age=86400";
    res.writeHead(200, {
      ...headers,
      "Content-Type": type,
      "Content-Length": info.size,
      "Cache-Control": cache,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on("error", () => {
      if (!res.headersSent) send(res, 500, "Error");
      else res.destroy();
    });
    stream.pipe(res);
  } catch {
    send(res, 404, notFound(errorLanguage(pathname)), "text/html; charset=utf-8");
  }
});

startDesk();
server.listen(port, host, () => {
  console.log(`listening on http://${host}:${port}`);
});
