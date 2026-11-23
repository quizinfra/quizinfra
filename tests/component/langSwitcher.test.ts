import { beforeEach, describe, expect, test } from 'vitest';
import {
  initI18n,
  mountLanguageSwitcher,
  setLocale,
  getLocale,
  t,
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  LANG_STORAGE_KEY,
} from '../../src/i18n/index.js';

function setupDOM() {
  document.body.innerHTML = `
    <div class="lang-switcher" id="langSwitcher"></div>
    <h1 data-i18n="app.title">Multiple Choice Printable Quiz Maker</h1>
    <button data-i18n="actions.clear_quiz">Clear Quiz</button>
    <input id="quizTitle" data-i18n-placeholder="form.quiz_title_placeholder"
           placeholder="Enter quiz title"/>
    <div id="questionsContainer"></div>`;
}

function getSelect(): HTMLSelectElement {
  const select = document.getElementById('langSwitcherSelect');
  expect(select, 'switcher <select> was not mounted').not.toBeNull();
  return select as HTMLSelectElement;
}

describe('Language switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('en');
    setupDOM();
    initI18n();
    mountLanguageSwitcher();
  });

  test('renders one option per supported locale, labelled with fixed emblems', () => {
    const options = Array.from(getSelect().options);
    expect(options.map(o => o.value)).toEqual([...SUPPORTED_LOCALES]);
    expect(options.map(o => o.textContent)).toEqual(
      SUPPORTED_LOCALES.map(code => LOCALE_LABELS[code])
    );
    // Labels are deliberately NOT translated: they must stay identical
    // regardless of the active locale.
    setLocale('fr');
    mountLanguageSwitcher(document.createElement('div'));
    setLocale('en');
  });

  test('selecting a locale re-translates the live DOM', () => {
    setLocale('es');
    const esTitle = t('app.title');
    const esButton = t('actions.clear_quiz');
    const esPlaceholder = t('form.quiz_title_placeholder');
    setLocale('en');
    expect(getLocale()).toBe('en');

    const select = getSelect();
    select.value = 'es';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(getLocale()).toBe('es');
    expect(document.querySelector('h1')!.textContent).toBe(esTitle);
    expect(
      document.querySelector('button[data-i18n="actions.clear_quiz"]')!.textContent
    ).toBe(esButton);
    expect(
      document
        .querySelector('input[data-i18n-placeholder="form.quiz_title_placeholder"]')!
        .getAttribute('placeholder')
    ).toBe(esPlaceholder);
    expect(document.documentElement.lang).toBe('es');
  });

  test('the choice persists to localStorage and wins on next load', () => {
    const select = getSelect();
    select.value = 'fr';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(localStorage.getItem(LANG_STORAGE_KEY)).toBe('fr');

    // Simulate a fresh page load with the stored preference.
    setLocale('en');
    setupDOM();
    const lang = initI18n();
    expect(lang).toBe('fr');
    expect(document.querySelector('h1')!.textContent).toBe(
      'Créateur de quiz imprimibles à choix multiples'
    );
  });

  test('mounting without a container is a no-op (partial DOMs in tests)', () => {
    expect(mountLanguageSwitcher(document.getElementById('nope'))).toBeNull();
  });
});
