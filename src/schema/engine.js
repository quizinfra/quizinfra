// src/schema/engine.js
// The shape interpreter for the additive-only schema model. Each frozen
// version directory contributes ONE bundled module (vN/quiz.js) whose
// entire shipped declaration is a single SchemaVersion instance: a
// version number plus the data table mapping every field name to a
// field *kind*. This file owns the class and its private interpreter
// internals; the version directories own the data. The stages:
//
//   SchemaVersion#validate(raw)
//       type-check every PRESENT field against its kind (unknown
//       property names are ignored — see src/schema/README.md rule 3);
//   SchemaVersion#normalize(raw)
//       fill every ABSENT field with its kind's default — the blanket
//       type-based policy (any string → "", any array → [], any bag
//       → {});
//   SchemaVersion#blankQuestion()
//       a new empty question, filled from the same table.
//
// One table, one owner: validation, default-filling and blank questions
// are methods on the object that holds the table, so they can never
// disagree about which fields exist — each version declares its fields
// exactly once, at its construction site in vN/quiz.js. Later versions
// *extend* earlier tables (v2's quiz table spreads
// VERSION_1.shape.quiz and adds `tags`) — legal only because schema
// changes are additive-only and earlier versions are frozen; see
// src/schema/README.md. The dependency direction is strictly downward:
// vN may build on vN-1 and on this file, never upward.
//
// Fixed-cost like validate.js (src/schema/README.md rule 2): per-version
// policy lives in the shape tables, never in branches here. A new field
// *kind* (e.g. a future "number") is added to KINDS once; a new *field*
// is only ever a new table entry in a new version directory.

import { Issues, hasOwn, isPlainObject } from "./validate.js";

/**
 * One frozen schema version: its number, its field tables, and the
 * pipeline stages the shared interpreter drives from them. Every
 * version behaves the same way, so declaring a version is purely data;
 * a version that ever genuinely needs different behavior subclasses
 * this and overrides the stage (index.js's getVersionOrThrow remains
 * the single place that decides what a version is and does).
 */
export class SchemaVersion {
  /**
   * @param {number} version the schemaVersion number this instance is
   * @param {{quiz: object, question: object}} shape the version's field
   *   tables (field name → field kind), declared exactly once in
   *   vN/quiz.js (src/schema/README.md rule 1)
   */
  constructor(version, shape) {
    this.version = version;
    this.shape = shape;
  }

  /**
   * Type-check `raw` as a document of this version. TYPE-STRICT,
   * PRESENCE-LENIENT: every field may be absent, anything present must
   * have the right type; unknown properties are ignored. Collects every
   * issue before throwing so a hand-edited file can be fixed in one
   * pass. Never mutates.
   * @returns {object} `raw` unchanged.
   * @throws {QuizDataError} listing every violation.
   */
  validate(raw) {
    const issues = new Issues();
    if (!isPlainObject(raw)) {
      issues.add(issues.root, "a quiz object", raw);
    } else {
      for (const [key, kind] of Object.entries(this.shape.quiz)) {
        kindOf(kind).check(issues, raw, key, `${issues.root}.${key}`, this.shape.question);
      }
      // The stamp is not a shape field: optional on disk (absent means
      // "legacy v1", decided by detectVersion), but when present it
      // must be honest about the version it claims.
      if (hasOwn(raw, "schemaVersion") && raw.schemaVersion !== this.version) {
        issues.add(`${issues.root}.schemaVersion`, String(this.version), raw.schemaVersion);
      }
    }
    issues.throwIfAny();
    return raw;
  }

  /**
   * Return a fully populated quiz copy of `raw`, filling only what is
   * absent with this version's kind defaults. Never mutates `raw`; the
   * output is fully independent of the input (all mutable containers
   * are copied).
   * @param {object} raw a plain object (validated at this version upstream)
   */
  normalize(raw) {
    const filled = fillFields(raw, this.shape.quiz, {}, this.shape.question);
    // The stamp is only carried through if present — fabricating one
    // would forge a version claim, and detection happens before
    // normalization anyway.
    if (hasOwn(raw, "schemaVersion")) filled.schemaVersion = raw.schemaVersion;
    return filled;
  }

  /**
   * A blank question for the UI: the same kind defaults the normalizer
   * would fill, from the same table. Single source of truth for "what
   * does a new empty question contain" (the editor's four option rows
   * are a ui.js policy layered on top; the data model does not pin
   * option cardinality).
   */
  blankQuestion() {
    return fillFields({}, this.shape.question, {}, undefined);
  }
}

/**
 * The closed set of field kinds: how to check a present value and what
 * default an absent one gets. `check` gets the Issues collector (all
 * checks are presence-lenient — Issues.field handles the absent case);
 * `defaultValue` must return a fresh value per call (no shared `{}`/`[]`).
 * Arrays carry no cardinality constraint at the data-model level (the
 * four-option editor layout is a UI policy, not a schema one); item
 * types are still judged exactly. "questions" is quiz-level only: its
 * items are checked item-by-item against the version's question table.
 */
const KINDS = {
  string: {
    check: (issues, object, key, path) =>
      issues.field(object, key, value => typeof value === "string", "a string", path),
    defaultValue: () => "",
  },
  stringArray: {
    check: (issues, object, key, path) => issues.arrayOf(object, key, "string", path),
    defaultValue: () => [],
  },
  booleanArray: {
    check: (issues, object, key, path) => issues.arrayOf(object, key, "boolean", path),
    defaultValue: () => [],
  },
  stringBag: {
    // Present bag must be a plain object of strings. JSON.parse
    // materialises a "__proto__" key as a plain own property, so a
    // "__proto__" entry is inert here — keys() iteration never touches
    // the prototype chain.
    check: (issues, object, key, path) => {
      if (!issues.field(object, key, isPlainObject, "an object (string -> string)", path)) {
        return;
      }
      const bag = object[key];
      Object.keys(bag).forEach(name => {
        if (typeof bag[name] !== "string") {
          issues.add(`${path}[${JSON.stringify(name)}]`, "a string", bag[name]);
        }
      });
    },
    defaultValue: () => ({}),
  },
  questions: {
    check: (issues, object, key, path, questionShape) =>
      collectQuestionsItems(issues, object, key, path, questionShape),
    defaultValue: () => [],
  },
};

/** Kind lookup with a loud failure for a table typo (test-time only). */
function kindOf(kind) {
  const definition = KINDS[kind];
  if (definition === undefined) {
    throw new Error(`unknown field kind "${kind}" in a shape table`);
  }
  return definition;
}

/** The `questions` field: an array of objects, each checked per questionShape. */
function collectQuestionsItems(issues, quiz, key, path, questionShape) {
  if (!issues.field(quiz, key, Array.isArray, "an array of questions", path)) {
    return;
  }
  quiz[key].forEach((question, index) => {
    const qPath = `${path}[${index}]`;
    if (!isPlainObject(question)) {
      issues.add(qPath, "a question object", question);
      return;
    }
    for (const [name, kind] of Object.entries(questionShape)) {
      kindOf(kind).check(issues, question, name, `${qPath}.${name}`, undefined);
    }
  });
}

/**
 * Shallow-copy present mutable containers (arrays, plain objects) so the
 * filled document never aliases the caller's; scalars pass through, and
 * so do wrong-typed values (normalization never repairs — those belong
 * to a file the validator already rejected on the pipeline path).
 */
function copyValue(value) {
  if (Array.isArray(value)) return [...value];
  if (isPlainObject(value)) return { ...value };
  return value;
}

/**
 * Fill every absent field of `source` per `shape` into `target`; never
 * mutates `source`. Fields absent from `shape` (unknown properties) are
 * dropped: the normalizer is whitelist-built, which is what "unknown
 * properties are ignored" means concretely.
 */
function fillFields(source, shape, target, itemShape) {
  for (const [key, kind] of Object.entries(shape)) {
    if (!hasOwn(source, key)) {
      target[key] = kindOf(kind).defaultValue();
      continue;
    }
    const value = source[key];
    if (kind === "questions") {
      target[key] = Array.isArray(value)
        ? value.map(item =>
            isPlainObject(item) ? fillFields(item, itemShape, {}, undefined) : item
          )
        : copyValue(value); // wrong type: pass through for the validator
    } else {
      target[key] = copyValue(value);
    }
  }
  return target;
}
