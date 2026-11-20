// src/quizData.js
// Pure helpers for building, serialising and deserialising quiz data.
// No DOM access – safe to unit‑test.

/**
 * @typedef {Object} Question
 * @property {string} text
 * @property {string[]} answers            // length 4
 * @property {boolean[]} correctAnswers   // length 4
 * @property {string} explanation
 */

/**
 * @typedef {Object} QuizData
 * @property {string} title
 * @property {string} teacherName
 * @property {string} instructions
 * @property {string} date
 * @property {Question[]} questions
 */

/**
 * Build the payload object from UI elements.
 * The function is pure – callers pass the DOM nodes they want to read.
 */
export function buildQuizPayload(
  titleEl,
  teacherEl,
  instrEl,
  dateEl,
  questions
) {
  return {
    title: titleEl.value,
    teacherName: teacherEl.value,
    instructions: instrEl.value,
    date: dateEl.value,
    questions,
  };
}

/** Serialise a QuizData object to JSON string */
export function serializeQuiz(data) {
  return JSON.stringify(data);
}

/** Parse a JSON string back into a QuizData object */
export function deserializeQuiz(json) {
  return JSON.parse(json);
}
