import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function text(value) {
  return { content: [{ type: "text", text: value }] };
}

function section(catalog, keys) {
  return keys
    .map((key) => catalog[key])
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n");
}

function profileText(catalogs) {
  const en = catalogs.en;
  return [
    en["meta.title"],
    en["kicker"],
    en["hero.claim"],
    en["lede"],
    "",
    "Work",
    section(en, [
      "work.cto.where",
      "work.cto.text",
      "work.ecommerce.where",
      "work.ecommerce.text",
      "work.engineer.where",
      "work.engineer.text",
    ]),
    "",
    "Projects",
    section(en, ["projects.smartport.text", "projects.wire.text", "projects.events.text"]),
    "Wire source: https://github.com/robinprause1/wire",
    "Store: https://smartport.com",
    "",
    "Education",
    section(en, ["education.degree", "education.where", "education.text"]),
  ].join("\n");
}

function documentsText(catalogs) {
  const en = catalogs.en;
  const lines = [
    ["documents.cv", "documents.cvDetail"],
    ["documents.diploma", "documents.diplomaDetail"],
    ["documents.transcript", "documents.transcriptDetail"],
    ["documents.reference", "documents.randstad"],
    ["documents.reference", "documents.thesis"],
    ["documents.internship", "documents.abrio"],
    ["documents.reference", "documents.gewa"],
    ["documents.reference", "documents.mainz"],
    ["documents.reference", "documents.uhp"],
  ];
  return [
    ...lines.map(([title, detail]) => `${en[title] ?? title}: ${en[detail] ?? ""}`.trim()),
    `Certified SAFe 6 Agilist: ${en["documents.safe"] ?? ""}`,
  ].join("\n");
}

function serverFor(catalogs) {
  const mcp = new McpServer({ name: "robin-prause", version: "1.0.0" });
  mcp.registerTool(
    "profile",
    {
      title: "Profile",
      description: "Public biography, work, and projects from robin-prause.de. No documents and no model call.",
    },
    async () => text(profileText(catalogs)),
  );
  mcp.registerTool(
    "documents",
    {
      title: "Documents",
      description: "Titles of the public documents on the personal site. Does not return file contents.",
    },
    async () => text(documentsText(catalogs)),
  );
  return mcp;
}

export async function handleMcp(req, res, catalogs) {
  const mcp = serverFor(catalogs);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    mcp.close().catch(() => {});
  });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
}
