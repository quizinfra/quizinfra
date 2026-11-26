// Fixture-purity guard for the committed artifact. The per-version
// sample corpus (src/schema/v*/{samples,invalid}) exists only to be
// consumed by the test suites; none of it may ever end up inlined in
// docs/index.html. This extends the spirit of singlefile.test.ts: not
// just "no external resources", but "no test data smuggled into the
// shipped bytes either" (it would bloat the artifact and leak quiz
// content of questionable taste).

import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ARTIFACT_PATH = join(process.cwd(), "docs", "index.html");
const SCHEMA_ROOT = join(process.cwd(), "src/schema");

// Strings at or above this length from fixture files are distinctive
// enough that no legitimate app/locale string collides with them; the
// corpus was authored with that in mind. Shorter values ({} key names,
// "true"-ish words) would produce meaningless failures.
const DISTINCTIVE_MIN_LENGTH = 8;

// QuizData/Question field names: fixtures carry them as object keys,
// but the app itself legitimately mentions every one of them (schema
// validators, the serializer), so keys — and only keys — skip these.
const STRUCTURAL_KEYS = new Set([
  "schemaVersion",
  "title",
  "teacherName",
  "instructions",
  "date",
  "tags",
  "questions",
  "text",
  "answers",
  "correctAnswers",
  "explanation",
]);

function fixtureStrings(): string[] {
  const found = new Set<string>();
  const versionDirs = readdirSync(SCHEMA_ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^v\d+$/.test(e.name))
    .map(e => e.name);
  for (const dir of versionDirs) {
    for (const sub of ["samples", "invalid"]) {
      const path = join(SCHEMA_ROOT, dir, sub);
      if (!existsSync(path)) continue;
      for (const file of readdirSync(path).filter(f => f.endsWith(".json"))) {
        const walk = (value: unknown): void => {
          if (typeof value === "string") {
            if (value.length >= DISTINCTIVE_MIN_LENGTH) found.add(value);
          } else if (Array.isArray(value)) {
            value.forEach(walk);
          } else if (value !== null && typeof value === "object") {
            for (const key of Object.keys(value as object)) {
              if (
                key.length >= DISTINCTIVE_MIN_LENGTH &&
                !STRUCTURAL_KEYS.has(key)
              ) {
                found.add(key);
              }
              walk((value as Record<string, unknown>)[key]);
            }
          }
        };
        walk(JSON.parse(readFileSync(join(path, file), "utf8")));
      }
    }
  }
  return [...found];
}

describe("artifact stays free of fixture data", () => {
  const html = existsSync(ARTIFACT_PATH) ? readFileSync(ARTIFACT_PATH, "utf8") : null;

  test("the corpus is substantial (guards the test itself)", () => {
    const strings = fixtureStrings();
    expect(strings.length).toBeGreaterThan(40);
  });

  test("no fixture string appears in the committed artifact", () => {
    expect(html, "docs/index.html is missing; run `npm run build`").not.toBeNull();
    const leaks = fixtureStrings().filter(s => (html as string).includes(s));
    expect(leaks, `fixture strings leaked into the artifact: ${leaks.join(" | ")}`).toEqual([]);
  });
});
