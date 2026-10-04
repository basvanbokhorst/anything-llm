const fs = require("fs");
const os = require("os");
const path = require("path");
const lancedb = require("@lancedb/lancedb");
const {
  ftsQueryText,
  cosineDistance,
  rrfFuse,
  hybridCandidates,
  createFtsIndex,
} = require("../../../../utils/vectorDbProviders/lance/hybrid");

describe("ftsQueryText", () => {
  it("strips punctuation and operators and lowercases", () => {
    expect(ftsQueryText('Wat is "de" AND (omzet)? -x')).toBe("wat is de and omzet x");
  });
  it("returns empty string for non-text input", () => {
    expect(ftsQueryText("?!")).toBe("");
  });
});

describe("cosineDistance", () => {
  it("is 0 for identical, 1 for orthogonal and 1 for zero vectors", () => {
    expect(cosineDistance([1, 0], [2, 0])).toBeCloseTo(0);
    expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1);
    expect(cosineDistance([0, 0], [1, 1])).toBe(1);
  });
});

describe("rrfFuse", () => {
  it("ranks rows found by both lists above rows found by one", () => {
    const a = [{ id: "x" }, { id: "y" }, { id: "z" }];
    const b = [{ id: "z" }, { id: "w" }];
    const fused = rrfFuse([a, b], 10).map((r) => r.id);
    expect(fused[0]).toBe("z"); // rank 3 in one list and rank 1 in the other beats rank 1 in only one
    expect(fused.slice(0, 2).sort()).toEqual(["x", "z"]);
    expect(fused).toHaveLength(4);
  });
  it("cuts to top and keeps the first row object seen", () => {
    const first = { id: "x", _distance: 0.1 };
    const fused = rrfFuse([[first], [{ id: "x" }, { id: "y" }]], 1);
    expect(fused).toEqual([first]);
  });
});

describe("hybridCandidates (real LanceDB table)", () => {
  let dir;
  let table;
  // 3-dim toy vectors: the keyword document is deliberately far from the query vector.
  const rows = [
    { id: "near", vector: [1, 0, 0], text: "algemene beschrijving van de dienst" },
    { id: "near2", vector: [0.9, 0.1, 0], text: "een ander verhaal over teams" },
    { id: "kw", vector: [0, 0, 1], text: "factuurnummer XJ-4471 is betaald op vrijdag" },
    { id: "far", vector: [0, 1, 0], text: "volstrekt ongerelateerde tekst" },
  ];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lance-hybrid-"));
    const db = await lancedb.connect(dir);
    table = await db.createTable("t", rows);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("stays vector-only without a full-text index", async () => {
    const { mode, rows: out } = await hybridCandidates({
      collection: table, query: "factuurnummer XJ-4471", queryVector: [1, 0, 0], limit: 3,
    });
    expect(mode).toBe("vector");
    expect(out.map((r) => r.id).slice(0, 2)).toEqual(["near", "near2"]);
  });

  it("with an index finds the keyword hit the vector search ranks last, with a usable _distance", async () => {
    await createFtsIndex(table);
    const { mode, rows: out } = await hybridCandidates({
      collection: table, query: "factuurnummer XJ-4471?", queryVector: [1, 0, 0], limit: 2,
    });
    expect(mode).toBe("hybrid");
    const kw = out.find((r) => r.id === "kw");
    expect(kw).toBeDefined();
    expect(kw._distance).toBeCloseTo(1); // orthogonal to the query vector
    expect(kw._score).toBeUndefined();
  });

  it("also finds rows added after the index was built", async () => {
    await table.add([{ id: "late", vector: [0, 0.2, 1], text: "unieke oranjeboom notitie" }]);
    const { rows: out } = await hybridCandidates({
      collection: table, query: "oranjeboom", queryVector: [1, 0, 0], limit: 3,
    });
    expect(out.map((r) => r.id)).toContain("late");
  });

  it("falls back to vector-only when the query has no words", async () => {
    const { mode } = await hybridCandidates({
      collection: table, query: "?!", queryVector: [1, 0, 0], limit: 2,
    });
    expect(mode).toBe("vector");
  });
});
