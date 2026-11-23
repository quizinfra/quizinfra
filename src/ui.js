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

import {
  buildQuizPayload,
  serializeQuiz,
  deserializeQuiz,
} from "./quizData.js";
import { t, getLocale, initI18n, mountLanguageSwitcher, onLocaleChange } from "./i18n/index.js";

let questions = [];



export function getQuizData() {
  return buildQuizPayload(
    document.getElementById("quizTitle"),
    document.getElementById("teacherName"),
    document.getElementById("instructions"),
    document.getElementById("quizDate"),
    questions
  );
}

export function setQuizData(data) {
  document.getElementById("quizTitle").value = data.title || "";
  document.getElementById("teacherName").value = data.teacherName || "";
  document.getElementById("instructions").value = data.instructions || "";
  document.getElementById("quizDate").value = data.date || "";
  questions = data.questions || [];
}

export function addQuestion() {
  const question = {
    text: "",
    answers: ["", "", "", ""],
    correctAnswers: [false, false, false, false],
    explanation: "",
  };
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
      <button onclick="removeQuestion(${index})">${t("question.remove")}</button>
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

export function loadProgress() {
  const saved = localStorage.getItem("quizData");
  if (saved) {
    const data = deserializeQuiz(saved);
    setQuizData(data);
    renderQuestions();
    notify(t("toast.loaded"));
  } else {
    notify(t("toast.no_saved"));
  }
}

export function previewQuiz() {
  const previewContent = document.getElementById("previewContent");
  previewContent.innerHTML = `
    <h3>${escapeHTML(document.getElementById("quizTitle").value)}</h3>
    <p><strong>${t("labels.teacher")}</strong> ${escapeHTML(document.getElementById("teacherName").value)}</p>
    <p><strong>${t("labels.date")}</strong> ${escapeHTML(document.getElementById("quizDate").value)}</p>
    <p>${escapeHTML(document.getElementById("instructions").value)}</p>
    ${questions
      .map(
        (q, i) => `
      <div>
        <h4>${t("labels.question", { n: i + 1 })}</h4>
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

export function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) {
    notify(t("toast.no_file_selected"));
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const quiz = deserializeQuiz(e.target.result);
      setQuizData(quiz);
      renderQuestions();
      notify(t("toast.imported"));
    } catch {
      notify(t("toast.import_failed"));
    }
    event.target.value = ""; // reset
  };
  reader.readAsText(file);
}

export function generateWordDocument() {
  let docContent = `
    <!DOCTYPE html>
    <html lang="${escapeHTML(getLocale())}">
    <head><meta charset="UTF-8"><title>${t("document.title")}</title></head><body>`;
  docContent += `
    <h2>${escapeHTML(document.getElementById("quizTitle").value)}</h2>
    <p><strong>${t("labels.teacher")}</strong> ${escapeHTML(document.getElementById("teacherName").value)}</p>
    <p><strong>${t("labels.date")}</strong> ${escapeHTML(document.getElementById("quizDate").value)}</p>
    <p>${escapeHTML(document.getElementById("instructions").value)}</p>`;
  questions.forEach((q, i) => {
    docContent += `
      <div>
        <h4>${t("labels.question", { n: i + 1 })}</h4>
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
        <h4>${t("labels.question", { n: i + 1 })}</h4>
        <p>${escapeHTML(q.text)}</p>`;
    q.answers.forEach((a, idx) => {
      content += `<p style='margin-left:20px;'>${String.fromCharCode(65 + idx)}. ${escapeHTML(a)} ${q.correctAnswers[idx] ? t("labels.correct") : ""}</p>`;
    });
    if (q.explanation) content += `<p><strong>${t("labels.explanation")}</strong> ${escapeHTML(q.explanation)}</p>`;
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
