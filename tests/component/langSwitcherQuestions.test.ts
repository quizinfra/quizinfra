import { beforeEach, describe, expect, test } from 'vitest';
import {
  getLocale,
  initI18n,
  mountLanguageSwitcher,
  setLocale,
  t,
} from '../../src/i18n/index.js';
import {
  addQuestion,
  clearQuiz,
  updateAnswer,
  updateCorrectAnswer,
  updateQuestionText,
} from '../../src/ui.js';

// Regression: repro steps were "load page, click Add Question, change
// language with the switcher". The static top-of-page form translated,
// but the already-rendered question form did not (adding a *second*
// question made everything refresh, because addQuestion() re-renders
// every question from the current locale).

function setupDOM() {
  document.body.innerHTML = `
    <div id="langSwitcher"></div>
    <input id="quizTitle"/><input id="teacherName"/><textarea id="instructions"></textarea>
    <input id="quizDate"/><div id="questionsContainer"></div>`;
}

function getSelect(): HTMLSelectElement {
  const select = document.getElementById('langSwitcherSelect');
  expect(select, 'switcher <select> was not mounted').not.toBeNull();
  return select as HTMLSelectElement;
}

function switchTo(lang: string) {
  const select = getSelect();
  select.value = lang;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * The strings renderQuestions() must show for a question at position `n`
 * under `locale`, read from the locale files themselves (same style as
 * langSwitcher.test.ts: never hardcode translations in tests).
 */
function questionStrings(locale: string, n: number) {
  const previous = getLocale();
  setLocale(locale);
  const strings = {
    heading: t('question.heading', { n }),
    textLabel: t('question.text_label'),
    explanationLabel: t('question.explanation_label'),
    removeButton: t('question.remove'),
  };
  setLocale(previous);
  return strings;
}

describe('Language switch with rendered questions', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
    setupDOM();
    initI18n();
    mountLanguageSwitcher();
    // ui.js keeps `questions` at module scope across tests in this file.
    clearQuiz();
  });

  test('switching language re-translates an already-rendered question form', () => {
    addQuestion();

    // Sanity: before the switch the question form shows English strings.
    const en = questionStrings('en', 1);
    const before = document.querySelector('.question')!;
    expect(before.querySelector('h4')!.textContent).toBe(en.heading);

    switchTo('es');
    expect(getLocale()).toBe('es');

    const es = questionStrings('es', 1);
    const question = document.querySelector('.question')!;
    const labels = question.querySelectorAll('label');
    expect(question.querySelector('h4')!.textContent).toBe(es.heading);
    // labels: [question text, A, B, C, D, explanation]
    expect(labels[0].textContent).toBe(es.textLabel);
    expect(labels[labels.length - 1].textContent).toBe(es.explanationLabel);
    expect(question.querySelector('button')!.textContent).toBe(es.removeButton);
  });

  test('every rendered question updates, not just ones added after the switch', () => {
    addQuestion();
    addQuestion();
    switchTo('fr');

    const questions = document.querySelectorAll('.question');
    expect(questions.length).toBe(2);
    questions.forEach((questionDiv, i) => {
      const fr = questionStrings('fr', i + 1);
      expect(questionDiv.querySelector('h4')!.textContent).toBe(fr.heading);
      const labels = questionDiv.querySelectorAll('label');
      expect(labels[0].textContent).toBe(fr.textLabel);
    });
  });

  test('the re-render keeps the question data the user typed', () => {
    addQuestion();
    updateQuestionText(0, 'What is 2 + 2?');
    updateAnswer(0, 1, 'four');
    updateCorrectAnswer(0, 1, true);

    switchTo('es');

    const question = document.querySelector('.question')!;
    const textInput = question.querySelector(
      'input[type="text"]'
    ) as HTMLInputElement;
    expect(textInput.value).toBe('What is 2 + 2?');

    const answerInputs = question.querySelectorAll(
      '.answer-row input[type="text"]'
    );
    expect((answerInputs[1] as HTMLInputElement).value).toBe('four');

    const checkboxes = question.querySelectorAll('.answer-row input[type="checkbox"]');
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
  });
});
