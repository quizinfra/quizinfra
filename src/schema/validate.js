// src/schema/validate.js
// Shared, fixed-cost primitives for the hand-written, zero-dependency
// *runtime* schema layer (this ships in the artifact). The JSON Schemas
// in the version directories are the normative, dev/test-time twin
// (ajv is a devDependency and never enters the artifact);
// tests/unit/schemaValidation.test.ts cross-checks the two
// representations against the same fixture corpus: every positive
// sample must pass BOTH, every invalid fixture must fail BOTH.
//
// Under the additive-only model (schemas only ever grow fields — see
// src/schema/README.md), each version directory is ONE bundled module
// (vN/quiz.js) holding a data table interpreted by engine.js. What
// remains here are the value-level primitives and the Issues collector
// that give failures their precise paths
// ("questions[0].answers[2] must be a string, got the number 1").
//
// Semantics are TYPE-STRICT, PRESENCE-LENIENT by project decision:
// every field may be absent (the normalize stage fills the type-based
// defaults), but anything that IS present must be exactly what its
// version's schema promises — wrong types and wrong shapes throw
// QuizDataError with the full issue list. (Validation collects every
// issue before throwing so a hand-edited file can be fixed in one
// pass.) Unknown properties are not issues: the import pipeline ignores
// them by dropping them at normalization (whitelist-built normalizers).
//
// Growth policy for this file: it is *shared infrastructure* imported by
// frozen version directories, so it is deliberately fixed-cost. Helpers
// here must stay generic and fully parameterized; new field *kinds*
// belong in engine.js KINDS, and anything encoding a single version's
// policy (which fields exist) belongs in that version's shape table. Do
// not add a "if version 3" branch here — it would retroactively change
// how frozen v1/v2 import.

import { QuizDataError } from "./errors.js";

/** True only for JSON objects (not arrays, not null, not classed objects). */
export function isPlainObject(value) {
  return (
    value !== null && typeof value === "object" && !Array.isArray(value)
  );
}

/** Short human description of any JSON value, for issue messages. */
export function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  switch (typeof value) {
    case "string":
      return `the string ${JSON.stringify(value)}`;
    case "number":
      return `the number ${value}`;
    case "boolean":
      return `the boolean ${value}`;
    default:
      return `a ${typeof value}`;
  }
}

/** hasOwnProperty-safe property test. */
export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Collects issue strings and throws them as a single QuizDataError.
 * `path` values are JS-ish access paths ("questions[0].answers[2]") so
 * they read directly against the file's own structure. Every check is
 * presence-lenient: an absent property is legal (engine.js's normalize
 * stage fills defaults); a present one must satisfy the predicate.
 */
export class Issues {
  constructor(root = "quiz") {
    this.root = root;
    this.list = [];
  }

  add(path, expected, actual) {
    this.list.push(`${path} must be ${expected}, got ${describeValue(actual)}`);
  }

  /** Throw a QuizDataError listing every collected issue, if any. */
  throwIfAny() {
    if (this.list.length > 0) {
      throw new QuizDataError(this.list.join("; "), this.list);
    }
  }

  /**
   * The skeleton behind every "own property of an object" check: `key`
   * may be absent — every field is optional by policy, and filling
   * absent fields is the pipeline's normalize stage, not the
   * validator's — but when present it must pass `predicate`. The one
   * `expected` phrase feeds the failure message ("must be X, got Y").
   * Returns true when the property is present *and* passed, letting
   * callers continue into structural checks (item types, allow-lists).
   */
  field(object, key, predicate, expected, path) {
    if (!hasOwn(object, key)) {
      return false; // absent is legal; defaults are normalize()'s job
    }
    if (!predicate(object[key])) {
      this.add(path, expected, object[key]);
      return false;
    }
    return true;
  }

  /**
   * Check a present array whose every item is of primitive type
   * `itemType` ("string" | "boolean"; both pluralise with a plain "s").
   * No cardinality constraint: option counts are a data-model-free
   * policy; only item types are judged.
   */
  arrayOf(object, key, itemType, path) {
    if (!this.field(object, key, Array.isArray, `an array of ${itemType}s`, path)) {
      return;
    }
    object[key].forEach((item, index) => {
      if (typeof item !== itemType) {
        this.add(`${path}[${index}]`, `a ${itemType}`, item);
      }
    });
  }
}
