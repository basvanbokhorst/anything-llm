// Greenberry: lets an API client read the full text of a document, or a window around a search hit, so a caller
// (the MCP) can "search, then read" instead of working with 1000-character chunks only. A chunk often misses the
// specific fact that sits a few paragraphs further in the same document.
const DEFAULT_LIMIT = 20000;
const MAX_LIMIT = 100000;
const DEFAULT_WINDOW = 4000;
const MAX_WINDOW = 20000;
const HEADER = /<document_metadata>[\s\S]*?<\/document_metadata>\s*/g;

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Finds `passage` in `text` ignoring differences in whitespace. Returns the index in the ORIGINAL text, or -1.
function findPassage(text, passage) {
  const clean = String(passage ?? "")
    .replace(HEADER, "")
    .trim();
  if (!clean) return -1;
  for (const length of [120, 50]) {
    const probe = clean.slice(0, length).trim();
    if (probe.length < 15) continue;
    const pattern = probe.split(/\s+/).map(escapeRegExp).join("\\s+");
    const match = new RegExp(pattern).exec(text);
    if (match) return match.index;
  }
  return -1;
}

/**
 * @param {{text?: string, offset?: number, limit?: number, around?: string, window?: number}} input
 * @returns {{text: string, offset: number, length: number, totalChars: number, nextOffset: number|null, found?: boolean}}
 */
function windowText({ text = "", offset, limit, around, window } = {}) {
  const full = String(text ?? "");
  const totalChars = full.length;

  if (around) {
    const size = Math.min(
      Math.max(toInt(window, DEFAULT_WINDOW), 1) || DEFAULT_WINDOW,
      MAX_WINDOW
    );
    const index = findPassage(full, around);
    if (index < 0) {
      const slice = full.slice(0, size);
      return {
        text: slice,
        offset: 0,
        length: slice.length,
        totalChars,
        nextOffset: slice.length < totalChars ? slice.length : null,
        found: false,
      };
    }
    const passageLength = Math.min(
      String(around).replace(HEADER, "").trim().length,
      size
    );
    const start = Math.max(0, index - Math.floor((size - passageLength) / 2));
    const slice = full.slice(start, start + size);
    return {
      text: slice,
      offset: start,
      length: slice.length,
      totalChars,
      nextOffset:
        start + slice.length < totalChars ? start + slice.length : null,
      found: true,
    };
  }

  const start = Math.max(0, toInt(offset, 0));
  const size = Math.min(
    toInt(limit, DEFAULT_LIMIT) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const slice = full.slice(start, start + Math.max(size, 1));
  return {
    text: slice,
    offset: start,
    length: slice.length,
    totalChars,
    nextOffset: start + slice.length < totalChars ? start + slice.length : null,
  };
}

// Maps search-hit (chunk) ids to the document location (docpath) via the document_vectors table.
// Never throws: a lookup problem must not break a search.
async function locationsForVectorIds(vectorIds = [], workspaceId = null) {
  try {
    const ids = [...new Set(vectorIds.filter(Boolean).map(String))];
    if (ids.length === 0) return new Map();
    const { DocumentVectors } = require("../../models/vectors");
    const { Document } = require("../../models/documents");
    const links = await DocumentVectors.where({ vectorId: { in: ids } });
    const docIds = [...new Set(links.map((l) => l.docId))];
    if (docIds.length === 0) return new Map();
    const docs = await Document.where({
      docId: { in: docIds },
      ...(workspaceId ? { workspaceId } : {}),
    });
    const pathByDoc = new Map(docs.map((d) => [d.docId, d.docpath]));
    return new Map(
      links
        .filter((l) => pathByDoc.has(l.docId))
        .map((l) => [l.vectorId, pathByDoc.get(l.docId)])
    );
  } catch (e) {
    console.error("locationsForVectorIds failed", e.message);
    return new Map();
  }
}

module.exports = {
  windowText,
  locationsForVectorIds,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DEFAULT_WINDOW,
  MAX_WINDOW,
};
