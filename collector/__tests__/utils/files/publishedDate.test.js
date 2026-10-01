/* eslint-env jest, node */
const fs = require("fs");
const os = require("os");
const path = require("path");

// utils/files resolves its storage folders from STORAGE_DIR at require time.
process.env.STORAGE_DIR = process.env.STORAGE_DIR || os.tmpdir();
const { publishedDate, createdDate } = require("../../../utils/files");

describe("publishedDate", () => {
  let tmpFile;
  beforeAll(() => {
    tmpFile = path.join(os.tmpdir(), `published-date-${process.pid}.txt`);
    fs.writeFileSync(tmpFile, "x");
  });
  afterAll(() => fs.rmSync(tmpFile, { force: true }));

  test("uses metadata.published (epoch ms) when it is given", () => {
    const epoch = Date.parse("2026-03-01T10:00:00.000Z");
    expect(publishedDate({ published: epoch }, tmpFile)).toBe(
      new Date(epoch).toLocaleString()
    );
  });

  test("accepts metadata.published as a numeric string (multipart form field)", () => {
    const epoch = Date.parse("2026-03-01T10:00:00.000Z");
    expect(publishedDate({ published: String(epoch) }, tmpFile)).toBe(
      new Date(epoch).toLocaleString()
    );
  });

  test("falls back to the file creation date when published is absent", () => {
    expect(publishedDate({}, tmpFile)).toBe(createdDate(tmpFile));
    expect(publishedDate(undefined, tmpFile)).toBe(createdDate(tmpFile));
  });

  test.each([null, true, false, "", "  ", "geen datum", 1e20, "Infinity"])(
    "falls back to the file creation date for unusable published value %p",
    (published) => {
      expect(publishedDate({ published }, tmpFile)).toBe(createdDate(tmpFile));
    }
  );

  test("honours 0 as a valid epoch", () => {
    expect(publishedDate({ published: 0 }, tmpFile)).toBe(
      new Date(0).toLocaleString()
    );
  });
});
