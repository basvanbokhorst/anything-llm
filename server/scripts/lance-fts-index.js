// Greenberry: builds/refreshes the LanceDB full-text index used by hybrid search (LANCEDB_HYBRID=on).
//   node scripts/lance-fts-index.js [namespace ...]     (all tables when no namespace is given)
// Needs ~1.5 GB free RAM for 600k chunks. Run it outside the app container's memory budget and outside the
// sync window; rows added later are still found (searched unindexed) until the next run folds them in.
const path = require("path");
const lancedb = require("@lancedb/lancedb");
const { createFtsIndex, hasFtsIndex } = require("../utils/vectorDbProviders/lance/hybrid");

(async () => {
  const base = process.env.STORAGE_DIR || path.resolve(__dirname, "../storage");
  const db = await lancedb.connect(path.resolve(base, "lancedb"));
  const wanted = process.argv.slice(2);
  const names = wanted.length ? wanted : await db.tableNames();
  for (const name of names) {
    const table = await db.openTable(name);
    const t0 = Date.now();
    const had = await hasFtsIndex(table);
    await createFtsIndex(table);
    console.log(
      `${name}: ${await table.countRows()} rows, index ${had ? "rebuilt" : "created"} in ${((Date.now() - t0) / 1000).toFixed(0)}s`
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
