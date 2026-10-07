/* eslint-env jest, node */
const {
  documentKey,
  onePerDocument,
} = require("../../../../utils/vectorDbProviders/lance/distinctDocuments");

describe("onePerDocument", () => {
  test("keeps only the best ranked chunk of each document, in order", () => {
    const rows = [
      { id: 1, url: "file://a" },
      { id: 2, url: "file://b" },
      { id: 3, url: "file://a" },
      { id: 4, url: "file://c" },
      { id: 5, url: "file://b" },
    ];
    expect(onePerDocument(rows).map((r) => r.id)).toEqual([1, 2, 4]);
  });

  test("falls back to docSource, then title, when there is no url", () => {
    expect(documentKey({ docSource: "drive:1", title: "x" })).toBe("drive:1");
    expect(documentKey({ title: "x" })).toBe("x");
  });

  test("never collapses chunks that have no identity", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3, url: "file://a" }];
    expect(onePerDocument(rows)).toHaveLength(3);
  });

  test("returns an empty list for no input", () => {
    expect(onePerDocument()).toEqual([]);
    expect(onePerDocument([])).toEqual([]);
  });
});
