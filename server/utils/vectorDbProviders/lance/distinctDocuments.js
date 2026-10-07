// Greenberry: collapse chunk hits to one hit per document. Without this, several chunks of the same document take
// several of the topN slots (about 1 in 5 of the top-5 slots in the production search log), which pushes related
// documents out of the result. Opt-in per search with `distinctDocuments`; chat keeps all chunks.

/** Identity of the document a chunk belongs to; chunks without any identity never collapse. */
function documentKey(row) {
  return row?.url || row?.docSource || row?.title || null;
}

/**
 * Keeps the first (best ranked) chunk of every document. Input must already be ranked best first.
 * @param {object[]} rows
 * @returns {object[]}
 */
function onePerDocument(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = documentKey(row);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { documentKey, onePerDocument };
