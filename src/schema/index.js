// src/schema/index.js
// The quiz-data import pipeline, framework-free and DOM-free — the
// single choke point every persisted quiz passes through (file import
// AND localStorage). Stages:
//
//   text --JSON.parse--> raw --detect--> version --validate@version-->
//        --normalize@version--> --migrate chain: (migrate -->
//        normalize@next --> validate@next)*--> current-shape data
//
// Each frozen version directory declares everything the bundle needs to
// know about it in one module (vN/quiz.js): its SchemaVersion instance
// — the shape table (field name → kind) that engine.js interprets into
// the validator, the normalizer and the UI's blank questions — plus any
// migration hop INTO that version (later versions extend earlier
// tables — schema changes are additive-only — see
// src/schema/README.md). Registering a version means adding one case to
// getVersionOrThrow below: the single version→SchemaVersion registry,
// and the single place an unknown version is refused. Because every
// pipeline stage reaches its version through that lookup, no stage needs
// its own "is this version registered?" guard.
//
// Semantics are TYPE-STRICT, PRESENCE-LENIENT by project decision:
// every field may be absent, and the per-version normalize stage fills
// absent fields with type-based kind defaults (any string "", any array
// [], any bag {}, questions []); anything that IS present must have
// exactly the right type, or the import is rejected loudly with the
// full issue list (nothing is silently coerced or repaired —
// normalization only ever fills what is missing, never fixes what is
// there). Unknown properties are ignored: the whitelist-built
// normalizers simply drop them. Files claiming a NEWER version than
// this build knows are refused with UnsupportedSchemaVersionError
// rather than guessed at.
//
// normalize runs BEFORE each re-validation so the validator always
// sees a fully populated document; it is whitelist-built, so it can
// never introduce a shape the schema does not know. A buggy migration
// that DROPS a field is caught by the per-hop field-set unit tests
// (tests/unit/migrations.test.ts), not by the schema.
//
// Backwards compatibility contract: every frozen version directory's
// samples must import through this module to the current shape —
// enforced for the whole corpus by tests/compat/schemaCompat.test.ts.

import {
  QuizImportError,
  QuizDataError,
  UnsupportedSchemaVersionError,
} from "./errors.js";
import { CURRENT_VERSION, WRITTEN_VERSION } from "./current.js";
import { migrations } from "./migrations.js";
import { hasOwn, isPlainObject, describeValue } from "./validate.js";
import { VERSION_1 } from "./v1/quiz.js";
import { VERSION_2 } from "./v2/quiz.js";

/**
 * The version → SchemaVersion registry: the one place frozen schema
 * versions are known, and the one place an unknown version throws.
 * Each instance is declared in its own version directory (vN/quiz.js);
 * registering a new version means adding one case here (plus the vN
 * directory and a migrations.js entry — see src/schema/README.md's v3
 * checklist). The completeness test (tests/unit/migrations.test.ts)
 * fails if a version in the chain has no case here.
 */
export function getVersionOrThrow(version) {
  switch (version) {
    case 1:
      return VERSION_1;
    case 2:
      return VERSION_2;
    default:
      throw new QuizDataError(`unknown schemaVersion ${version}`);
  }
}

/**
 * Determine which schema version a freshly parsed JSON payload claims:
 * the `schemaVersion` field if present, else legacy v1 (the original
 * exporter emitted no version marker at all).
 * @throws {QuizDataError|UnsupportedSchemaVersionError}
 */
export function detectVersion(raw) {
  if (!isPlainObject(raw)) {
    throw new QuizDataError(
      `quiz data must be a JSON object, got ${describeValue(raw)}`
    );
  }
  if (!hasOwn(raw, "schemaVersion")) return 1;
  const version = raw.schemaVersion;
  if (!Number.isInteger(version) || version < 1) {
    throw new QuizDataError(
      `schemaVersion must be a positive integer, got ${describeValue(version)}`
    );
  }
  if (version > CURRENT_VERSION) {
    throw new UnsupportedSchemaVersionError(version, CURRENT_VERSION);
  }
  return version;
}

/**
 * Run `raw` through the migration chain up to CURRENT_VERSION. Step 0
 * normalizes the input at `fromVersion`, so migrations always receive a
 * fully populated source-shape document (they whitelist-build their
 * output and may assume every field exists). After every hop the
 * result is normalized at the new version and re-validated, so a buggy
 * migration cannot pass type corruption downstream unnoticed. Pure: the
 * input object is never mutated.
 */
export function migrateToLatest(raw, fromVersion) {
  let data = getVersionOrThrow(fromVersion).normalize(raw);
  let version = fromVersion;
  while (version < CURRENT_VERSION) {
    const hop = migrations.find(step => step.from === version);
    if (hop === undefined || hop.to !== version + 1) {
      throw new QuizDataError(
        `migration chain is broken: no ${version} -> ${version + 1} step`
      );
    }
    data = hop.migrate(data);
    version = hop.to;
    const target = getVersionOrThrow(version);
    data = target.normalize(data);
    target.validate(data);
  }
  return data;
}

/**
 * Parse, version-detect, validate, normalize and migrate quiz data in
 * one call.
 * @param {string} text the raw contents of an exported quiz JSON file
 *   (or a localStorage entry).
 * @returns {{data: object, fromVersion: number, migrated: boolean}}
 *   `data` in the CURRENT_VERSION shape, fully populated (absent fields
 *   carry the current version's documented defaults), ready for the UI.
 * @throws {QuizImportError} family for anything malformed or newer.
 */
export function importQuiz(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new QuizImportError(
      `file is not valid JSON (${cause instanceof Error ? cause.message : String(cause)})`
    );
  }
  const from = getVersionOrThrow(detectVersion(raw));
  from.validate(raw);
  const data = migrateToLatest(raw, from.version);
  return { data, fromVersion: from.version, migrated: from.version !== CURRENT_VERSION };
}

export {
  QuizImportError,
  QuizDataError,
  UnsupportedSchemaVersionError,
  CURRENT_VERSION,
  WRITTEN_VERSION,
};
