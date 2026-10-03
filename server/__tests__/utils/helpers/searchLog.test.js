/* eslint-env jest, node */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { logVectorSearch } = require("../../../utils/helpers/searchLog");

describe("logVectorSearch", () => {
  let dir;
  const original = { ...process.env };
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "searchlog-"));
    process.env.STORAGE_DIR = dir;
    delete process.env.VECTOR_SEARCH_LOG;
  });
  afterEach(() => {
    process.env = { ...original };
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const logFile = () => {
    const folder = path.join(dir, "query-log");
    const [name] = fs.readdirSync(folder);
    return path.join(folder, name);
  };
  const waitForFile = async () => {
    for (let i = 0; i < 40; i++) {
      const folder = path.join(dir, "query-log");
      if (fs.existsSync(folder) && fs.readdirSync(folder).length) {
        const content = fs.readFileSync(logFile(), "utf8");
        if (content.trim()) return content;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    return "";
  };

  test("writes one JSON line per search with query, settings and top results", async () => {
    logVectorSearch({
      workspace: "sales",
      query: "wat weten we over ANWB?",
      topN: 20,
      scoreThreshold: 0.25,
      ms: 123,
      sources: [
        { title: "a.txt", docSource: "https://x/a", score: 0.912345 },
        { title: "b.txt", docSource: "https://x/b", score: 0.5 },
      ],
    });
    const content = await waitForFile();
    const entry = JSON.parse(content.trim());
    expect(entry).toMatchObject({
      workspace: "sales",
      query: "wat weten we over ANWB?",
      topN: 20,
      scoreThreshold: 0.25,
      ms: 123,
      n: 2,
    });
    expect(typeof entry.ts).toBe("string");
    expect(entry.top).toEqual([
      { title: "a.txt", docSource: "https://x/a", score: 0.912 },
      { title: "b.txt", docSource: "https://x/b", score: 0.5 },
    ]);
  });

  test("files are per month", async () => {
    logVectorSearch({ workspace: "w", query: "q", sources: [] });
    await waitForFile();
    expect(path.basename(logFile())).toMatch(/^vector-search-\d{4}-\d{2}\.jsonl$/);
  });

  test("truncates a very long query and keeps only the top 10 results", async () => {
    logVectorSearch({
      workspace: "w",
      query: "x".repeat(5000),
      sources: Array.from({ length: 25 }, (_, i) => ({ title: `t${i}`, score: 0.1 })),
    });
    const entry = JSON.parse((await waitForFile()).trim());
    expect(entry.query.length).toBe(2000);
    expect(entry.n).toBe(25);
    expect(entry.top).toHaveLength(10);
  });

  test("writes nothing when VECTOR_SEARCH_LOG=off", async () => {
    process.env.VECTOR_SEARCH_LOG = "off";
    logVectorSearch({ workspace: "w", query: "q", sources: [] });
    await new Promise((r) => setTimeout(r, 150));
    expect(fs.existsSync(path.join(dir, "query-log"))).toBe(false);
  });

  test("never throws, even when the log folder cannot be created", () => {
    const blocker = path.join(dir, "geen-map");
    fs.writeFileSync(blocker, "ik ben een bestand");
    process.env.STORAGE_DIR = blocker; // query-log kan hier niet onder worden aangemaakt
    expect(() => logVectorSearch({ workspace: "w", query: "q", sources: [] })).not.toThrow();
  });

  test("never throws on missing or odd input", () => {
    expect(() => logVectorSearch()).not.toThrow();
    expect(() => logVectorSearch({ query: undefined, sources: null })).not.toThrow();
  });
});
