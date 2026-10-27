import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleMcp } from "./mcp.js";
import { mailConfigured, sendContact } from "./mail.js";

const envFile = new URL("./.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const root = fileURLToPath(new URL("./public", import.meta.url));
const template = readFileSync(new URL("./public/index.html", import.meta.url), "utf8");
const pages = {
  cv: template,
  impressum: readFileSync(new URL("./templates/impressum.html", import.meta.url), "utf8"),
  privacy: readFileSync(new URL("./templates/datenschutz.html", import.meta.url), "utf8"),
  offer: readFileSync(new URL("./templates/beratung.html", import.meta.url), "utf8"),
};
const formPages = new Set(["/", "/de", "/cv", "/de/lebenslauf"]);
const moved = new Map([
  ["/consulting", "/"],
  ["/de/beratung", "/de"],
]);
const catalogs = {
  en: flatten(JSON.parse(readFileSync(new URL("./i18n/en.json", import.meta.url), "utf8"))),
  de: flatten(JSON.parse(readFileSync(new URL("./i18n/de.json", import.meta.url), "utf8"))),
};
const site = (process.env.SITE_URL || "https://www.robin-prause.de").replace(/\/+$/, "");
const paths = {
  offer: { en: "/", de: "/de" },
  cv: { en: "/cv", de: "/de/lebenslauf" },
  impressum: { en: "/impressum", de: "/de/impressum" },
  privacy: { en: "/datenschutz", de: "/de/datenschutz" },
};
const indexed = ["offer", "cv"];
const faqKeys = ["day", "jobs", "which", "trade", "worth", "ai", "after", "data", "price"];
const linkedin = "https://www.linkedin.com/in/robin-prause-330666278";
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

function render(source, lang, extra = {}) {
  const flat = catalogs[lang] ?? catalogs.en;
  return source.replace(/\{\{([a-zA-Z0-9.]+)\}\}/g, (match, key) => {
    const value = Object.hasOwn(extra, key) ? extra[key] : flat[key];
    if (value === undefined) return match;
    return escapeHtml(String(value));
  });
}

function pageFor(pathname) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === "/" || path === "/index.html") return { lang: "en", name: "offer" };
  if (path === "/de") return { lang: "de", name: "offer" };
  if (path === "/cv") return { lang: "en", name: "cv" };
  if (path === "/de/lebenslauf") return { lang: "de", name: "cv" };
  if (path === "/impressum") return { lang: "en", name: "impressum" };
  if (path === "/de/impressum") return { lang: "de", name: "impressum" };
  if (path === "/datenschutz") return { lang: "en", name: "privacy" };
  if (path === "/de/datenschutz") return { lang: "de", name: "privacy" };
  return null;
}

function seoFields(name, lang) {
  return {
    site,
    canonical: site + paths[name][lang],
    "alt.en": site + paths[name].en,
    "alt.de": site + paths[name].de,
  };
}

function person(lang) {
  return {
    "@type": "Person",
    "@id": `${site}/#person`,
    name: "Robin Prause",
    jobTitle: "CTO",
    url: site + paths.cv[lang],
    image: `${site}/portrait.jpg`,
    email: "mailto:mail@robin-prause.de",
    address: { "@type": "PostalAddress", addressLocality: "Rodgau", addressRegion: "Hessen", addressCountry: "DE" },
    sameAs: [linkedin],
  };
}

function structuredData(name, lang) {
  const flat = catalogs[lang] ?? catalogs.en;
  let graph;
  if (name === "offer") {
    graph = [
      {
        "@type": "ProfessionalService",
        "@id": `${site}/#service`,
        name: `Robin Prause · ${flat["offer.service"]}`,
        description: flat["offer.description"],
        url: site + paths.offer[lang],
        image: `${site}/portrait.jpg`,
        email: "mailto:mail@robin-prause.de",
        address: { "@type": "PostalAddress", addressLocality: "Rodgau", addressRegion: "Hessen", addressCountry: "DE" },
        areaServed: [
          { "@type": "City", name: "Frankfurt am Main" },
          { "@type": "City", name: "Rodgau" },
          { "@type": "City", name: "Offenbach am Main" },
          { "@type": "City", name: "Darmstadt" },
          { "@type": "AdministrativeArea", name: "Rhein-Main" },
        ],
        knowsLanguage: ["de", "en"],
        founder: { "@id": `${site}/#person` },
      },
      person(lang),
      {
        "@type": "FAQPage",
        mainEntity: faqKeys.map((key) => ({
          "@type": "Question",
          name: flat[`offer.faq.${key}.q`],
          acceptedAnswer: { "@type": "Answer", text: flat[`offer.faq.${key}.a`] },
        })),
      },
    ];
  } else if (name === "cv") {
    graph = [{ "@type": "ProfilePage", url: site + paths.cv[lang], mainEntity: person(lang) }];
  } else {
    return "";
  }
  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

function sitemap() {
  const urls = indexed.flatMap((name) =>
    ["en", "de"].map(
      (lang) => `  <url>
    <loc>${site}${paths[name][lang]}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${site}${paths[name].en}"/>
    <xhtml:link rel="alternate" hreflang="de" href="${site}${paths[name].de}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${site}${paths[name].en}"/>
  </url>`,
    ),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
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

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { ...headers, "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
}

const hits = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function allowContact(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < 10 * 60 * 1000);
  if (recent.length >= 5) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

function singleLine(value) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function validContact(name, email, message) {
  if (name.length < 1 || name.length > 80) return false;
  if (message.length < 1 || message.length > 4000) return false;
  return email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 20_000) {
        reject(new Error("too big"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function redirectContact(res, lang, sent, back) {
  const path = formPages.has(back) ? back : lang === "de" ? "/de" : "/";
  res.writeHead(303, { Location: `${path}?sent=${sent}#kontakt`, "Cache-Control": "no-cache" });
  res.end();
}

function replyContact(req, res, lang, sent, back = "") {
  const accept = req.headers.accept;
  if (typeof accept === "string" && accept.includes("application/json")) {
    send(res, 200, JSON.stringify({ sent, note: formNote(lang, sent) }), "application/json; charset=utf-8");
    return;
  }
  redirectContact(res, lang, sent, back);
}

async function receiveContact(req, res) {
  let raw = "";
  try {
    raw = await readBody(req);
  } catch {
    replyContact(req, res, "en", "fail");
    return;
  }
  const fields = new URLSearchParams(raw);
  const lang = fields.get("lang") === "de" ? "de" : "en";
  const back = fields.get("back") || "";
  if ((fields.get("website") || "").trim()) {
    replyContact(req, res, lang, "ok", back);
    return;
  }
  const name = singleLine(fields.get("name") || "");
  const email = singleLine(fields.get("email") || "");
  const message = (fields.get("message") || "").replaceAll("\r\n", "\n").trim();
  if (!validContact(name, email, message) || !allowContact(clientIp(req))) {
    replyContact(req, res, lang, "fail", back);
    return;
  }
  if (!mailConfigured()) {
    replyContact(req, res, lang, "setup", back);
    return;
  }
  try {
    await sendContact({ name, email, message });
  } catch (error) {
    console.error("contact send failed", error instanceof Error ? error.message : error);
    replyContact(req, res, lang, "fail", back);
    return;
  }
  replyContact(req, res, lang, "ok", back);
}

function formNote(lang, sent) {
  const flat = catalogs[lang] ?? catalogs.en;
  if (sent === "ok") return flat["form.sent"] ?? "";
  if (sent === "fail") return flat["form.failed"] ?? "";
  if (sent === "setup") return flat["form.setup"] ?? "";
  return "";
}

const server = createServer((req, res) => {
  if (!req.url) {
    send(res, 400, "Bad request");
    return;
  }
  const pathname = req.url.split("?")[0];
  if (pathname === "/mcp") {
    handleMcp(req, res, catalogs).catch((error) => {
      console.error(error);
      if (!res.headersSent) send(res, 500, "Error");
    });
    return;
  }
  if (pathname === "/contact" && req.method === "POST") {
    receiveContact(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) send(res, 500, "Error");
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  if (pathname === "/sitemap.xml") {
    send(res, 200, sitemap(), "application/xml; charset=utf-8");
    return;
  }
  if (pathname === "/robots.txt") {
    send(res, 200, `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
    return;
  }

  const target = moved.get(pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname);
  if (target) {
    res.writeHead(301, { Location: target, "Cache-Control": "no-cache" });
    res.end();
    return;
  }

  const page = pageFor(pathname);
  if (page) {
    const sent = new URL(req.url, "http://localhost").searchParams.get("sent");
    const extra = seoFields(page.name, page.lang);
    if (page.name === "cv" || page.name === "offer") extra["form.note"] = formNote(page.lang, sent);
    const body = render(pages[page.name], page.lang, extra).replace("<!--ld-->", () => structuredData(page.name, page.lang));
    const language = page.lang;
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

server.listen(port, host, () => {
  console.log(`listening on http://${host}:${port}`);
});
