// src/quizData.js
// Pure helpers for building and serialising quiz data. No DOM access –
// safe to unit-test. Version detection, validation and migration live
// in ./schema/ (the import pipeline); this module keeps the *writing*
// side: assembling a payload from inputs and serialising it with the
// WRITTEN_VERSION stamp on (the release knob in src/schema/current.js).

import { getVersionOrThrow, WRITTEN_VERSION } from "./schema/index.js";

/**
 * @typedef {Object} Question
 * @property {string} text
 * @property {string[]} answers            // any length (the editor shows 4 rows)
 * @property {boolean[]} correctAnswers   // any length, parallel to answers
 * @property {string} explanation
 */

/**
 * @typedef {Object} QuizData
 * @property {number} schemaVersion        // stamped by serializeQuiz
 * @property {string} title
 * @property {string} teacherName
 * @property {string} instructions
 * @property {string} date
 * @property {Object<string,string>} tags  // arbitrary string->string metadata (v2+)
 * @property {Question[]} questions
 */

/**
 * Build the payload object from UI elements.
 * The function is pure – callers pass the DOM nodes they want to read.
 * `tags` is the tag bag carried by the caller (the app keeps it as
 * pass-through data until a tag editor exists); callers that have no tag
 * state pass nothing and get an empty bag (serializeQuiz and the schema
 * then guarantee the field exists on every written file).
 */
export function buildQuizPayload(
  titleEl,
  teacherEl,
  instrEl,
  dateEl,
  questions,
  tags
) {
  return {
    title: titleEl.value,
    teacherName: teacherEl.value,
    instructions: instrEl.value,
    date: dateEl.value,
    tags: tags || {},
    questions,
  };
}

/**
 * Serialise a QuizData object to its JSON wire form. The file is
 * written at WRITTEN_VERSION (not necessarily CURRENT_VERSION): the
 * payload is run through that version's normalize, so it contains
 * exactly the fields the written version knows — nothing a newer,
 * unreleased version has learned can leak onto disk, and any stale
 * stamp is replaced by a fresh one at the front. Files this app writes
 * are therefore always self-describing and always valid *as* the
 * version they claim to be.
 */
export function serializeQuiz(data) {
  const filled = getVersionOrThrow(WRITTEN_VERSION).normalize(data);
  // Strip any stamp normalize carried through *before* adding the
  // fresh one: spreading over an existing `schemaVersion` key would
  // keep the old value (and its original position in the object).
  delete filled.schemaVersion;
  return JSON.stringify({ schemaVersion: WRITTEN_VERSION, ...filled });
}
