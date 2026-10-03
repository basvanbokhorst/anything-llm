/* eslint-env jest, node */
const {
  windowText,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require("../../../utils/helpers/documentContent");

const text = Array.from({ length: 100 }, (_, i) => `regel ${i}.`).join(" ");

describe("windowText - offset and limit", () => {
  test("returns the start of the document with the default limit", () => {
    const out = windowText({ text });
    expect(out.offset).toBe(0);
    expect(out.totalChars).toBe(text.length);
    expect(out.text).toBe(text.slice(0, DEFAULT_LIMIT));
    expect(out.nextOffset).toBeNull(); // kort document: alles in één keer
  });

  test("pages through a long document with nextOffset", () => {
    const long = "x".repeat(50_000);
    const first = windowText({ text: long, limit: 20_000 });
    expect(first.length).toBe(20_000);
    expect(first.nextOffset).toBe(20_000);
    const second = windowText({ text: long, offset: first.nextOffset, limit: 20_000 });
    expect(second.offset).toBe(20_000);
    expect(second.nextOffset).toBe(40_000);
    const last = windowText({ text: long, offset: 40_000, limit: 20_000 });
    expect(last.length).toBe(10_000);
    expect(last.nextOffset).toBeNull();
  });

  test("clamps limit to MAX_LIMIT and a negative or NaN offset to 0", () => {
    const long = "y".repeat(MAX_LIMIT + 5000);
    expect(windowText({ text: long, limit: MAX_LIMIT * 10 }).length).toBe(MAX_LIMIT);
    expect(windowText({ text: long, offset: -50, limit: 10 }).offset).toBe(0);
    expect(windowText({ text: long, offset: "kapot", limit: 10 }).offset).toBe(0);
    expect(windowText({ text: long, limit: 0 }).length).toBe(DEFAULT_LIMIT);
  });

  test("an offset beyond the end returns an empty window", () => {
    const out = windowText({ text: "kort", offset: 999 });
    expect(out.text).toBe("");
    expect(out.nextOffset).toBeNull();
  });

  test("handles empty or missing text", () => {
    expect(windowText({ text: "" }).totalChars).toBe(0);
    expect(windowText({}).text).toBe("");
  });
});

describe("windowText - around a passage", () => {
  const doc =
    "Inleiding. ".repeat(200) +
    "Het aantal variabelen in het canvas is zeven en ze worden per sessie besproken. " +
    "Afsluiting. ".repeat(200);

  test("centres a window on the passage and reports found", () => {
    const passage = "Het aantal variabelen in het canvas is zeven";
    const out = windowText({ text: doc, around: passage, window: 600 });
    expect(out.found).toBe(true);
    expect(out.text).toContain(passage);
    expect(out.text.length).toBeLessThanOrEqual(600 + 5);
    expect(out.offset).toBeGreaterThan(0);
  });

  test("ignores the document_metadata header AnythingLLM puts on every chunk", () => {
    const chunk =
      "<document_metadata>\nsourceDocument: canvas.txt\npublished: 1/1/2026\n</document_metadata>\n\n" +
      "Het aantal variabelen in het canvas is zeven en ze worden per sessie besproken.";
    const out = windowText({ text: doc, around: chunk, window: 500 });
    expect(out.found).toBe(true);
    expect(out.text).toContain("zeven");
  });

  test("matches despite different whitespace between chunk and document", () => {
    const out = windowText({
      text: doc,
      around: "Het aantal   variabelen\nin het canvas is zeven",
      window: 400,
    });
    expect(out.found).toBe(true);
  });

  test("falls back to the start of the document when the passage is not found", () => {
    const out = windowText({ text: doc, around: "bestaat helemaal niet in dit document", window: 300 });
    expect(out.found).toBe(false);
    expect(out.offset).toBe(0);
    expect(out.text.length).toBeLessThanOrEqual(300);
  });

  test("a window near the start or end stays inside the document", () => {
    const start = windowText({ text: doc, around: "Inleiding.", window: 400 });
    expect(start.offset).toBe(0);
    const end = windowText({ text: doc, around: "Afsluiting.", window: 400 });
    expect(end.offset + end.length).toBeLessThanOrEqual(doc.length);
  });
});
