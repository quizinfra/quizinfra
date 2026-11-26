// src/schema/v2/quiz.js
// Everything the bundle needs to know about schema version 2: its
// SchemaVersion instance and the v1 -> v2 migration hop. v2 = v1 + the
// `tags` bag (a string -> string map of arbitrary user metadata); the
// question table is unchanged — the same table object is shared.
// Because schema changes are additive-only, v2 states only its
// difference and *extends* the frozen v1 tables (via VERSION_1.shape)
// rather than re-declaring them — the direction v1 permits (downward
// dependencies only: v2 reads v1, never the other way). The engine
// derives both validation and default-filling from the tables, exactly
// as for v1: `tags` and the stamp may be absent (normalize supplies
// the empty bag; a missing stamp means the file was never claimed as v2
// anyway), but present fields — every bag value included — must be
// type-correct, and unknown properties are ignored.

import { SchemaVersion } from "../engine.js";
import { VERSION_1 } from "../v1/quiz.js";

export const VERSION_2 = new SchemaVersion(2, {
  quiz: { ...VERSION_1.shape.quiz, tags: "stringBag" },
  question: VERSION_1.shape.question,
});

/**
 * v1 -> v2. One optional bag added: `tags`; old data carries none, so
 * the migration supplies an empty bag. Every other field passes through
 * unchanged and the stamp moves to schemaVersion 2.
 *
 * The input is assumed to have passed v1 validation already (the
 * pipeline guarantees that); the output is built from a whitelist of
 * fields rather than spreading, so a stray `schemaVersion: 1` re-stamp
 * on a legacy file cannot leak into the v2 document. Pure: never
 * mutates its input (verified in tests/unit/migrations.test.ts).
 * @param {object} quiz a validated version-1 document
 */
export function migrateV1ToV2(quiz) {
  return {
    schemaVersion: 2,
    title: quiz.title,
    teacherName: quiz.teacherName,
    instructions: quiz.instructions,
    date: quiz.date,
    tags: {},
    questions: quiz.questions.map(question => ({
      text: question.text,
      answers: [...question.answers],
      correctAnswers: [...question.correctAnswers],
      explanation: question.explanation,
    })),
  };
}
