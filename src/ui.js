// src/ui.js
// UI glue that uses the pure helpers from quizData.js.

/**
 * Simple wrapper around `alert` so tests can spy on a stable function.
 * It does not change runtime behaviour.
 */
export function notify(msg) {
  alert(msg);
}
// Functions are exported for testing and also attached to window
// so the inline onclick attributes in index.html keep working.

import { buildQuizPayload, serializeQuiz } from "./quizData.js";
import {
  importQuiz,
  getVersionOrThrow,
  CURRENT_VERSION,
  QuizImportError,
  UnsupportedSchemaVersionError,
} from "./schema/index.js";
import { t, getLocale, initI18n, mountLanguageSwitcher, onLocaleChange } from "./i18n/index.js";

let questions = [];

// UI-only policy: the editor always shows this many answer option rows
// for a newly added question. The data model places NO cardinality
// constraint on answers/correctAnswers (any length imports fine);
// per-question add/remove of options is a future UI workstream. Until
// then this constant is the only place the four-option layout lives.
const ANSWER_ROWS_PER_QUESTION = 4;

// The v2 `tags` bag (string -> string metadata). DATA-ONLY for now: the
// app carries tags through import -> state -> save/export untouched, but
// renders and edits no tag UI yet (that is a separate workstream). The
// spread-copy in setQuizData keeps a parsed "__proto__" key ordinary
// data (spread defines own properties, never triggering the setter).
let tags = {};



export function getQuizData() {
  return buildQuizPayload(
    document.getElementById("quizTitle"),
    document.getElementById("teacherName"),
    document.getElementById("instructions"),
    document.getElementById("quizDate"),
    questions,
    tags
  );
}

export function setQuizData(data) {
  document.getElementById("quizTitle").value = data.title || "";
  document.getElementById("teacherName").value = data.teacherName || "";
  document.getElementById("instructions").value = data.instructions || "";
  document.getElementById("quizDate").value = data.date || "";
  // The import pipeline guarantees `tags` on current-version data; the
  // fallback only serves direct callers/tests with partial objects.
  tags = data.tags ? { ...data.tags } : {};
  questions = data.questions || [];
}

export function addQuestion() {
  // Field names and their non-option defaults come from the schema's
  // current shape table (the same table the normalizer fills sparse
  // questions from); the editor's fixed option rows are the UI policy
  // layered on top.
  const question = getVersionOrThrow(CURRENT_VERSION).blankQuestion();
  question.answers = Array.from({ length: ANSWER_ROWS_PER_QUESTION }, () => "");
  question.correctAnswers = Array.from({ length: ANSWER_ROWS_PER_QUESTION }, () => false);
  questions.push(question);
  renderQuestions();
}

export function removeQuestion(index) {
  questions.splice(index, 1);
  renderQuestions();
}

/** Escape characters that have special meaning in HTML attributes or text nodes. */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderQuestions() {
  const container = document.getElementById("questionsContainer");
  container.innerHTML = "";
  questions.forEach((q, index) => {
    const questionDiv = document.createElement("div");
    questionDiv.className = "question";
    // Use double‑quoted attributes and escape any dangerous characters.
    questionDiv.innerHTML = `
      <h4>${t("question.heading", { n: index + 1 })}</h4>
      <div>
        <label>${t("question.text_label")}</label>
        <input type="text" value="${escapeHTML(q.text)}" oninput="updateQuestionText(${index}, this.value)">
      </div>
      ${q.answers
        .map(
          (a, i) => `
        <div class="answer-row">
          <label>${String.fromCharCode(65 + i)}</label>
          <input type="text" value="${escapeHTML(a)}" oninput="updateAnswer(${index}, ${i}, this.value)">
          <input type="checkbox" ${q.correctAnswers[i] ? "checked" : ""} onchange="updateCorrectAnswer(${index}, ${i}, this.checked)">
        </div>`
        )
        .join("")}
      <div>
        <label>${t("question.explanation_label")}</label>
        <textarea oninput="updateExplanation(${index}, this.value)">${escapeHTML(q.explanation)}</textarea>
      </div>
      <button class="btn-danger" onclick="removeQuestion(${index})">${t("question.remove")}</button>
    `;
    container.appendChild(questionDiv);
  });
}

export function updateQuestionText(index, value) {
  questions[index].text = value;
}

export function updateAnswer(qIndex, aIndex, value) {
  questions[qIndex].answers[aIndex] = value;
}

export function updateCorrectAnswer(qIndex, aIndex, isChecked) {
  questions[qIndex].correctAnswers[aIndex] = isChecked;
}

export function updateExplanation(index, value) {
  questions[index].explanation = value;
}

export function saveProgress() {
  const quizData = getQuizData();
  localStorage.setItem("quizData", serializeQuiz(quizData));
  notify(t("toast.saved"));
}

/**
 * Translate an import failure into a user-facing toast message.
 * Strict-import policy: the translated headline is followed by the
 * validator's technical issue list (English, for the console-savvy and
 * for bug reports); unknown errors are logged before the generic toast.
 */
function importErrorMessage(err) {
  if (err instanceof UnsupportedSchemaVersionError) {
    return t("toast.import_newer_version", { version: err.version });
  }
  if (err instanceof QuizImportError) {
    // Covers QuizDataError (validation issue list in .message) and the
    // parse/detect failures alike.
    return `${t("toast.import_failed")} ${err.message}`;
  }
  console.error(err);
  return t("toast.import_failed");
}

/**
 * Shared landing path for persisted data (localStorage entry). Parses,
 * version-detects, validates and migrates via the schema pipeline, then
 * populates the UI. Returns true on success.
 */
function applyImportedQuiz(text, successMsg) {
  try {
    const { data } = importQuiz(text);
    setQuizData(data);
    renderQuestions();
    notify(successMsg);
    return true;
  } catch (err) {
    notify(importErrorMessage(err));
    return false;
  }
}

export function loadProgress() {
  const saved = localStorage.getItem("quizData");
  if (saved) {
    applyImportedQuiz(saved, t("toast.loaded"));
  } else {
    notify(t("toast.no_saved"));
  }
}

export function previewQuiz() {
  const previewContent = document.getElementById("previewContent");
  previewContent.innerHTML = `
    <h3>${escapeHTML(document.getElementById("quizTitle").value)}</h3>
    <p><strong>${t("form.teacher_name")}:</strong> ${escapeHTML(document.getElementById("teacherName").value)}</p>
    <p><strong>${t("form.date")}:</strong> ${escapeHTML(document.getElementById("quizDate").value)}</p>
    <p>${escapeHTML(document.getElementById("instructions").value)}</p>
    ${questions
      .map(
        (q, i) => `
      <div>
        <h4>${t("question.heading", { n: i + 1 })}</h4>
        <p>${escapeHTML(q.text)}</p>
        ${q.answers
          .map(
            (a, j) => `<p style='margin-left:20px;'>${String.fromCharCode(65 + j)}. ${escapeHTML(a)}</p>`
          )
          .join("")}
      </div>`
      )
      .join("")}
  `;
  document.getElementById("previewModal").style.display = "block";
}

export function closePreview() {
  document.getElementById("previewModal").style.display = "none";
}

export function exportQuizData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(serializeQuiz(getQuizData()));
  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  a.setAttribute("download", "quiz_data.json");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function importQuizData() {
  document.getElementById("importFileInput").click();
}

/**
 * Read a chosen File through the schema pipeline. Returns a promise that
 * settles once the file has been handled (the inline onchange attribute
 * ignores it; tests await it). Kept thin on purpose: all data judgement
 * lives in src/schema/index.js.
 */
export function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) {
    notify(t("toast.no_file_selected"));
    return Promise.resolve(false);
  }
  const reader = new FileReader();
  const settled = new Promise(resolve => {
    reader.onload = e => {
      resolve(applyImportedQuiz(e.target.result, t("toast.imported")));
      event.target.value = ""; // reset so re-choosing the same file re-fires change
    };
    reader.onerror = () => {
      notify(t("toast.import_failed"));
      event.target.value = "";
      resolve(false);
    };
  });
  reader.readAsText(file);
  return settled;
}

export function generateWordDocument() {
  let docContent = `
    <!DOCTYPE html>
    <html lang="${escapeHTML(getLocale())}">
    <head><meta charset="UTF-8"><title>${t("document.title")}</title></head><body>`;
  docContent += `
    <h2>${escapeHTML(document.getElementById("quizTitle").value)}</h2>
    <p><strong>${t("form.teacher_name")}:</strong> ${escapeHTML(document.getElementById("teacherName").value)}</p>
    <p><strong>${t("form.date")}:</strong> ${escapeHTML(document.getElementById("quizDate").value)}</p>
    <p>${escapeHTML(document.getElementById("instructions").value)}</p>`;
  questions.forEach((q, i) => {
    docContent += `
      <div>
        <h4>${t("question.heading", { n: i + 1 })}</h4>
        <p>${escapeHTML(q.text)}</p>`;
    q.answers.forEach((a, idx) => {
      docContent += `<p style='margin-left:20px;'>${String.fromCharCode(65 + idx)}. ${escapeHTML(a)}</p>`;
    });
    docContent += `</div>`;
  });
  docContent += `</body></html>`;
  const blob = new Blob([docContent], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quiz_document.doc";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printAnswerSheet() {
  let content = `
    <!DOCTYPE html>
    <html lang="${escapeHTML(getLocale())}">
    <head><meta charset="UTF-8"><title>${t("answer_sheet.page_title")}</title></head><body>`;
  content += `
    <h2>${t("answer_sheet.heading", { title: document.getElementById("quizTitle").value })}</h2>`;
  questions.forEach((q, i) => {
    content += `
      <div>
        <h4>${t("question.heading", { n: i + 1 })}</h4>
        <p>${escapeHTML(q.text)}</p>`;
    q.answers.forEach((a, idx) => {
      content += `<p style='margin-left:20px;'>${String.fromCharCode(65 + idx)}. ${escapeHTML(a)} ${q.correctAnswers[idx] ? t("labels.correct") : ""}</p>`;
    });
    if (q.explanation) content += `<p><strong>${t("labels.explanation")}:</strong> ${escapeHTML(q.explanation)}</p>`;
    content += `</div>`;
  });
  content += `</body></html>`;
  const blob = new Blob([content], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "answer_sheet.doc";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function shuffleQuestions() {
  for (let i = questions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }
  renderQuestions();
}

export function shuffleAnswers() {
  questions.forEach(question => {
    const withIdx = question.answers.map((a, i) => ({ answer: a, idx: i }));
    for (let i = withIdx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [withIdx[i], withIdx[j]] = [withIdx[j], withIdx[i]];
    }
    const shuffledAnswers = withIdx.map(o => o.answer);
    const newCorrect = shuffledAnswers.map(a =>
      question.correctAnswers[withIdx.find(o => o.answer === a).idx]
    );
    question.answers = shuffledAnswers;
    question.correctAnswers = newCorrect;
  });
  renderQuestions();
}

export function clearQuiz() {
  questions = [];
  tags = {};
  document.getElementById("quizTitle").value = "";
  document.getElementById("teacherName").value = "";
  document.getElementById("instructions").value = "";
  document.getElementById("quizDate").value = "";
  renderQuestions();
  notify(t("toast.cleared"));
}

// Attach exported functions to the global window object so that inline onclick handlers can find them.
if (typeof window !== 'undefined') {
  Object.assign(window, {
    addQuestion,
    saveProgress,
    loadProgress,
    previewQuiz,
    exportQuizData,
    importQuizData,
    generateWordDocument,
    printAnswerSheet,
    shuffleQuestions,
    shuffleAnswers,
    clearQuiz,
    handleFileImport,
    closePreview,
    removeQuestion,
    updateQuestionText,
    updateAnswer,
    updateCorrectAnswer,
    updateExplanation,
  });
}

// Attach click listener for the Import button (no inline onclick needed)
if (typeof document !== 'undefined') {
  const importBtn = document.getElementById('importBtn');
  if (importBtn) {
    importBtn.addEventListener('click', importQuizData);
  }

  // Detect the active locale and translate all static markup.
  initI18n();

  // Language switcher (persists the user's choice for next load).
  mountLanguageSwitcher();

  // Question forms are rendered at runtime from t() output, so they carry
  // no data-i18n hooks for applyLanguage() to update. Re-render them from
  // the fresh locale when the user switches languages. (Nothing to do
  // while there are no questions; this also keeps the hook safe to
  // register before #questionsContainer exists.)
  onLocaleChange(() => {
    if (questions.length > 0) renderQuestions();
  });
}
