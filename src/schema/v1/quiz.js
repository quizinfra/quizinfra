// src/schema/v1/quiz.js
// Everything the bundle needs to know about schema version 1: its
// SchemaVersion instance. The field tables (field name → field kind)
// are declared exactly once, inlined at the construction site, and are
// deliberately NOT exported as a separate SHAPE constant — the table is
// the version's private declaration; the engine interprets it into
// validation, default filling and the UI's blank questions, and the
// only supported way to reach it is through the instance that owns it
// (.shape, read-only by convention). The version itself is registered
// as one case in index.js's getVersionOrThrow.
//
// Field kinds (and their type-based defaults: any string "", any array
// [], any bag {}) live in engine.js KINDS. There is no cardinality
// constraint on answers/correctAnswers at the data-model level; the
// four-option editor layout is a ui.js policy. TYPE-STRICT,
// PRESENCE-LENIENT: every field may be absent (normalize fills kind
// defaults) and unknown properties are ignored (normalize drops them),
// but anything present must be type-correct. Zero dependencies; ships
// in the artifact. Cross-checked against v1/schema.json (ajv) by
// tests/unit/schemaValidation.test.ts over the whole fixture corpus.
//
// FROZEN with this version directory (src/schema/README.md rule 1).
// Later versions may *extend* these tables through VERSION_1.shape
// (v2 builds on them) but must never edit them; the dependency
// direction is strictly downward.

import { SchemaVersion } from "../engine.js";

export const VERSION_1 = new SchemaVersion(1, {
  quiz: {
    title: "string",
    teacherName: "string",
    instructions: "string",
    date: "string",
    questions: "questions",
  },
  question: {
    text: "string",
    answers: "stringArray",
    correctAnswers: "booleanArray",
    explanation: "string",
  },
});
