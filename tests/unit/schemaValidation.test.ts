// Schema governance tests. The JSON Schemas (src/schema/vN/schema.json)
// are the normative definitions but are dev/test-time only (ajv is a
// devDependency and never enters the artifact). The runtime validators
// are hand-written duplicates — these tests are what keep the two
// representations honest:
//
//   * every positive sample of a version must pass BOTH its ajv schema
//     and its hand-written validator;
//   * every invalid fixture of a version must be REJECTED by BOTH
//     (a fixture the runtime validator accepts but ajv rejects is a
//     runtime bug, and vice versa — both directions matter);
//   * migration output validates against the CURRENT schema (ajv) and
//     the current runtime validator;
//   * no stage of validation ever mutates its input.

import { describe, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

import { getVersionOrThrow, migrateToLatest, CURRENT_VERSION } from "../../src/schema/index.js";
import { QuizDataError } from "../../src/schema/errors.js";

const SCHEMA_ROOT = join(process.cwd(), "src/schema");

const versionDirs = readdirSync(SCHEMA_ROOT, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^v\d+$/.test(entry.name))
  .map(entry => ({ dir: entry.name, version: Number(entry.name.slice(1)) }))
  .sort((a, b) => a.version - b.version);

function readFixture(dir: string, subdir: string, file: string): unknown {
  return JSON.parse(readFileSync(join(SCHEMA_ROOT, dir, subdir, file), "utf8"));
}

function listFixtures(dir: string, subdir: string): string[] {
  const path = join(SCHEMA_ROOT, dir, subdir);
  if (!existsSync(path)) return [];
  return readdirSync(path).filter(
    file => file.endsWith(".json") && !file.endsWith(".expected.json")
  );
}

// One ajv instance; each version's $id is distinct so they coexist.
// allErrors for richer failures. Crucially NO useDefaults/coerceTypes:
// ajv must never mutate the data under validation (asserted below).
const ajv = new Ajv2020({ allErrors: true });
const ajvValidators: Record<number, ReturnType<Ajv2020["compile"]>> = {};
for (const { dir, version } of versionDirs) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_ROOT, dir, "schema.json"), "utf8"));
  ajvValidators[version] = ajv.compile(schema);
}

const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value));

function expectAjvAccepts(version: number, data: unknown): void {
  const validate = ajvValidators[version];
  expect(
    validate(data),
    `ajv rejected ${JSON.stringify((data as any)?.title)}: ${JSON.stringify(validate.errors)}`
  ).toBe(true);
}

function expectRuntimeAccepts(version: number, data: unknown): void {
  expect(() => getVersionOrThrow(version).validate(data)).not.toThrow();
}

function expectAjvRejects(version: number, data: unknown): void {
  expect(ajvValidators[version](data)).toBe(false);
}

function expectRuntimeRejects(version: number, data: unknown): void {
  let thrown: unknown;
  try {
    getVersionOrThrow(version).validate(data);
  } catch (err) {
    thrown = err;
  }
  expect(thrown, `runtime validator v${version} accepted a bad fixture`).toBeInstanceOf(
    QuizDataError
  );
  // Type-strict validators report the full issue list, never an empty one.
  expect((thrown as QuizDataError).issues.length).toBeGreaterThan(0);
}

describe("schema corpus shape (guards the tests themselves)", () => {
  test("every version directory ships a schema, samples and invalid fixtures", () => {
    expect(versionDirs.length).toBeGreaterThanOrEqual(2);
    for (const { dir, version } of versionDirs) {
      expect(existsSync(join(SCHEMA_ROOT, dir, "schema.json")), `${dir}/schema.json`).toBe(true);
      expect(listFixtures(dir, "samples").length, `${dir}/samples`).toBeGreaterThan(0);
      expect(listFixtures(dir, "invalid").length, `${dir}/invalid`).toBeGreaterThan(0);
      // And the runtime pipeline knows how to validate it (one
      // version→SchemaVersion registry; an unregistered version throws).
      expect(() => getVersionOrThrow(version), `runtime validator for v${version}`).not.toThrow();
    }
  });

  test("the current version is the highest version directory", () => {
    expect(versionDirs[versionDirs.length - 1].version).toBe(CURRENT_VERSION);
  });
});

describe("positive samples pass BOTH representations of their version", () => {
  for (const { dir, version } of versionDirs) {
    for (const file of listFixtures(dir, "samples")) {
      test(`${dir}/samples/${file}`, () => {
        const raw = readFixture(dir, "samples", file);
        const before = snapshot(raw);
        expectAjvAccepts(version, raw);
        expectRuntimeAccepts(version, raw);
        // Neither validator may mutate the payload it inspects.
        expect(raw).toEqual(before);
      });
    }
  }
});

describe("invalid fixtures are rejected by BOTH representations of their version", () => {
  for (const { dir, version } of versionDirs) {
    for (const file of listFixtures(dir, "invalid")) {
      test(`${dir}/invalid/${file}`, () => {
        const raw = readFixture(dir, "invalid", file);
        const before = snapshot(raw);
        expectAjvRejects(version, raw);
        expectRuntimeRejects(version, raw);
        expect(raw).toEqual(before);
      });
    }
  }
});

describe("migrated data satisfies the CURRENT schema (ajv) end to end", () => {
  for (const { dir, version } of versionDirs) {
    for (const file of listFixtures(dir, "samples")) {
      test(`${dir}/samples/${file} -> v${CURRENT_VERSION}`, () => {
        const raw = readFixture(dir, "samples", file);
        const before = snapshot(raw);
        const migrated = migrateToLatest(raw, version);
        expectAjvAccepts(CURRENT_VERSION, migrated);
        expectRuntimeAccepts(CURRENT_VERSION, migrated);
        expect(raw, "migrations must never mutate their input").toEqual(before);
        if (version !== CURRENT_VERSION) {
          expect(migrated).not.toBe(raw);
          expect(migrated.schemaVersion).toBe(CURRENT_VERSION);
        }
      });
    }
  }
});
