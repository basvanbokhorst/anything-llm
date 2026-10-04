// Greenberry: hybrid retrieval for the LanceDB provider. Vector candidates are fused with LanceDB full-text-search (BM25)
// candidates via reciprocal rank fusion before they reach the reranker. Measured offline on 360 synthetic questions over
// 583k chunks: hit@5 0.300 (vector only) -> 0.386 (hybrid). Opt-in with LANCEDB_HYBRID=on; without a text index on the
// table (see scripts/lance-fts-index.js) searches silently stay vector-only.
const lancedb = require("@lancedb/lancedb");

const RRF_K = 60;
const CANDIDATES = 100;
// Dutch stemming and stopwords measured better than a plain tokenizer (hit@5 0.381 vs 0.333).
const FTS_OPTIONS = {
  baseTokenizer: "simple",
  lowercase: true,
  asciiFolding: true,
  stem: true,
  removeStopWords: true,
  language: "Dutch",
  withPosition: false,
};

const isHybridEnabled = () => process.env.LANCEDB_HYBRID === "on";

/** Plain words only: no operators or punctuation that the full-text parser could interpret. */
function ftsQueryText(query = "") {
  return String(query)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cosine distance (same scale as LanceDB's cosine _distance) between two vectors. */
function cosineDistance(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Reciprocal rank fusion over ranked row lists, keyed on row.id. Returns the top rows in fused order.
 * @param {Array<Array<{id: string}>>} lists
 * @param {number} top
 */
function rrfFuse(lists, top) {
  const scores = new Map();
  const rows = new Map();
  for (const list of lists) {
    list.forEach((row, rank) => {
      scores.set(row.id, (scores.get(row.id) || 0) + 1 / (RRF_K + rank + 1));
      // keep the first sighting; vector rows come first and already carry _distance
      if (!rows.has(row.id)) rows.set(row.id, row);
    });
  }
  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, top)
    .map(([id]) => rows.get(id));
}

async function hasFtsIndex(table) {
  const indices = await table.listIndices();
  return indices.some(
    (i) => i.indexType === "FTS" && (i.columns || []).includes("text")
  );
}

/**
 * Candidates for the reranker: vector + full-text hits fused by RRF. Rows only found by the text search get their
 * cosine _distance computed so the similarity threshold keeps working. Falls back to vector-only on any problem.
 * @returns {Promise<{rows: object[], mode: "hybrid"|"vector"}>}
 */
async function hybridCandidates({ collection, query, queryVector, limit }) {
  const vectorRows = await collection
    .vectorSearch(queryVector)
    .distanceType("cosine")
    .limit(CANDIDATES)
    .toArray();
  const text = ftsQueryText(query);
  const vectorOnly = () => ({ rows: vectorRows.slice(0, limit), mode: "vector" });
  if (!text || !(await hasFtsIndex(collection).catch(() => false)))
    return vectorOnly();

  let textRows;
  try {
    textRows = await collection
      .query()
      .fullTextSearch(text)
      .limit(CANDIDATES)
      .toArray();
  } catch (e) {
    console.error("[LanceDb hybrid] full-text search failed:", e.message);
    return vectorOnly();
  }

  const prepared = textRows.map(({ _score, ...row }) => ({
    ...row,
    _distance: cosineDistance(row.vector, queryVector),
  }));
  const fusedRows = rrfFuse([vectorRows, prepared], limit);
  return { rows: fusedRows, mode: "hybrid" };
}

/** Builds (or rebuilds) the full-text index. Needs ~1.5 GB RAM at 600k chunks: run it where memory allows. */
async function createFtsIndex(table) {
  await table.createIndex("text", {
    config: lancedb.Index.fts(FTS_OPTIONS),
    replace: true,
  });
}

module.exports = {
  isHybridEnabled,
  ftsQueryText,
  cosineDistance,
  rrfFuse,
  hasFtsIndex,
  hybridCandidates,
  createFtsIndex,
  FTS_OPTIONS,
};
