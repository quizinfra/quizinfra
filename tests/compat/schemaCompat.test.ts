// THE backwards-compatibility guarantee, as executable spec: every
// sample quiz file ever written by any shipped schema version must
// import through the production pipeline (importQuiz — the very
// function behind the "Import Quiz Data" button) into the current
// shape, byte-for-byte predictably, and survive an export/import
// round-trip. When a PR breaks any of this, old teachers' files break.
//
// Layout contract (src/schema/README.md): vN/samples/<name>.json is a
// faithful export of version N (created when N was current, frozen
// afterwards); vN/samples/<name>.expected.json is the hand-written
// statement of what the pipeline result must be — required for legacy
// versions (N < CURRENT, where the statement is the migrated result),
// and optional for current-version samples that rely on the normalize
// stage (where the statement is the file plus its filled-in defaults).
// Golden files are themselves fed back through the pipeline: a golden
// must be a valid current-version file that imports to itself, so typos
// in goldens are caught too.

import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { importQuiz, CURRENT_VERSION, WRITTEN_VERSION } from "../../src/schema/index.js";
import { serializeQuiz } from "../../src/quizData.js";

const SCHEMA_ROOT = join(process.cwd(), "src/schema");

const corpus = readdirSync(SCHEMA_ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^v\d+$/.test(entry.name))
  .map(entry => ({ dir: entry.name, version: Number(entry.name.slice(1)) }))
  .sort((a, b) => a.version - b.version)
  .flatMap(({ dir, version }) =>
    readdirSync(join(SCHEMA_ROOT, dir, "samples"))
      .filter(file => file.endsWith(".json") && !file.endsWith(".expected.json"))
      .map(file => ({ dir, version, file }))
  );

const read = (...parts: string[]) => readFileSync(join(SCHEMA_ROOT, ...parts), "utf8");

describe("compat corpus (guards the tests themselves)", () => {
  test("the corpus spans every frozen version", () => {
    const coveredVersions = [...new Set(corpus.map(s => s.version))].sort();
    expect(coveredVersions).toEqual(
      Array.from({ length: CURRENT_VERSION }, (_, i) => i + 1)
    );
    expect(corpus.length).toBeGreaterThanOrEqual(CURRENT_VERSION + 2);
  });
});

for (const { dir, version, file } of corpus) {
  describe(`${dir}/samples/${file}`, () => {
    const text = read(dir, "samples", file);
    const isLegacy = version !== CURRENT_VERSION;
    const stem = file.replace(/\.json$/, "");
    const goldenPath = `${dir}/samples/${stem}.expected.json`;
    const hasGolden = existsSync(join(SCHEMA_ROOT, goldenPath));

    test("imports to the expected current-shape data", () => {
      const { data, fromVersion, migrated } = importQuiz(text);
      expect(fromVersion).toBe(version);
      expect(migrated).toBe(isLegacy);
      // A golden, when present, is the authoritative expectation: the
      // file plus whatever the normalize stage fills in. Without one,
      // a current-version sample must import to itself unchanged.
      const expected = hasGolden
        ? JSON.parse(read(dir, "samples", `${stem}.expected.json`))
        : JSON.parse(text);
      expect(data).toEqual(expected);
    });

    test("golden itself round-trips through the pipeline (current-version validity)", () => {
      if (isLegacy) {
        expect(existsSync(join(SCHEMA_ROOT, goldenPath)), `${goldenPath} is required`).toBe(true);
      }
      if (!hasGolden) return; // current-version sample that imports to itself
      const golden = read(dir, "samples", `${stem}.expected.json`);
      const { data, migrated } = importQuiz(golden);
      expect(migrated, "a golden must be a current-version file").toBe(false);
      expect(data).toEqual(JSON.parse(golden));
    });

    test("export -> import is idempotent and stamps the written version", () => {
      const { data } = importQuiz(text);
      const exported = serializeQuiz(data);
      // Files are written at WRITTEN_VERSION (the release knob), which
      // may lag the reader's CURRENT_VERSION while a format is staged.
      expect(exported.startsWith(`{"schemaVersion":${WRITTEN_VERSION},`)).toBe(true);
      const again = importQuiz(exported);
      expect(again.migrated).toBe(WRITTEN_VERSION !== CURRENT_VERSION);
      if (WRITTEN_VERSION === CURRENT_VERSION) {
        // Writer and reader agree: a full-fidelity round-trip.
        expect(again.data).toEqual(data);
      } else {
        // Writer pinned behind the reader: fields only the newer
        // versions know are legitimately dropped on disk, so the
        // re-imported data carries their defaults (a v1 write cannot
        // carry the v2 tags bag).
        expect(again.data.tags).toEqual({});
      }
      // Exporting the re-imported data is a fixed point.
      expect(serializeQuiz(again.data)).toBe(exported);
    });
  });
}
