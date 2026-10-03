const fs = require("fs");
const path = require("path");

// Greenberry: writes one JSON line per /vector-search call so real colleague questions can be analysed
// (the MCP searches through this route and nothing else records them). Only the query text, settings and the
// top results (title, docSource, score) are kept; the API key is shared, so no identity is logged.
// Disable with VECTOR_SEARCH_LOG=off. Never throws: a logging problem must not break a search.
const MAX_QUERY_CHARS = 2000;
const MAX_RESULTS = 10;

function logFolder() {
  return process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR, "query-log")
    : path.resolve(__dirname, "../../storage/query-log");
}

function logVectorSearch({
  workspace,
  query,
  topN,
  scoreThreshold,
  ms,
  sources,
} = {}) {
  if (process.env.VECTOR_SEARCH_LOG === "off") return;
  try {
    const now = new Date();
    const list = Array.isArray(sources) ? sources : [];
    const entry = {
      ts: now.toISOString(),
      workspace,
      query: String(query ?? "").slice(0, MAX_QUERY_CHARS),
      topN,
      scoreThreshold,
      ms,
      n: list.length,
      top: list.slice(0, MAX_RESULTS).map((s) => ({
        title: s?.title,
        docSource: s?.docSource,
        score:
          typeof s?.score === "number"
            ? Math.round(s.score * 1000) / 1000
            : s?.score,
      })),
    };
    const folder = logFolder();
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(
      folder,
      `vector-search-${now.toISOString().slice(0, 7)}.jsonl`
    );
    fs.appendFile(file, JSON.stringify(entry) + "\n", () => {});
  } catch {
    // bewust genegeerd
  }
}

module.exports = { logVectorSearch };
