import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveProgress, loadProgress } from '../../src/ui.js';
import { CURRENT_VERSION, WRITTEN_VERSION } from '../../src/schema/index.js';

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" value="My Quiz">
    <input id="teacherName" value="Prof X">
    <textarea id="instructions">Instr</textarea>
    <input id="quizDate" value="2026-11-21">
    <div class="button-group">
      <button>Save Progress</button>
      <button>Load Progress</button>
    </div>`;
}

function fullSetupDOM() {
  // Ensure the container exists for renderQuestions during load
  return `
    <input id="quizTitle" value="My Quiz">
    <input id="teacherName" value="Prof X">
    <textarea id="instructions">Instr</textarea>
    <input id="quizDate" value="2026-11-21">
    <div id="questionsContainer"></div>
    <div class="button-group">
      <button>Save Progress</button>
      <button>Load Progress</button>
    </div>`;
}

describe('Save / Load Progress', () => {
  test('stores and restores quiz data via localStorage', async () => {
    document.body.innerHTML = fullSetupDOM();
    await import('../../src/ui.js');
    // Direct calls
    saveProgress();
    expect(localStorage.getItem('quizData')).not.toBeNull();

    // change fields
    (document.getElementById('quizTitle') as HTMLInputElement).value = '';
    (document.getElementById('teacherName') as HTMLInputElement).value = '';
    loadProgress();

    expect((document.getElementById('quizTitle') as HTMLInputElement).value).toBe('My Quiz');
    expect((document.getElementById('teacherName') as HTMLInputElement).value).toBe('Prof X');
    expect((global as any).alert).toHaveBeenCalledWith('Progress loaded!');
  });

  test('saves carry the written schemaVersion stamp', async () => {
    document.body.innerHTML = fullSetupDOM();
    await import('../../src/ui.js');
    localStorage.removeItem('quizData');
    saveProgress();
    const stored = JSON.parse(localStorage.getItem('quizData') as string);
    expect(stored.schemaVersion).toBe(WRITTEN_VERSION);
    if (WRITTEN_VERSION === CURRENT_VERSION) {
      expect(stored.tags).toEqual({});
    } else {
      // Writer pinned behind the reader: the v1 writer only emits the
      // fields v1 knows, so the v2 tags field never reaches disk.
      expect(stored).not.toHaveProperty('tags');
    }
  });

  test('legacy v1 saves (no schemaVersion) load through the migration path', async () => {
    document.body.innerHTML = fullSetupDOM();
    await import('../../src/ui.js');
    // Exactly what the pre-versioning app persisted: unversioned v1 JSON.
    const legacy = readFileSync(
      join(process.cwd(), 'src/schema/v1/samples/basic.json'),
      'utf8'
    );
    localStorage.setItem('quizData', legacy);

    loadProgress();

    expect((document.getElementById('quizTitle') as HTMLInputElement).value).toBe(
      'Frogs of the Pampas'
    );
    expect((document.getElementById('teacherName') as HTMLInputElement).value).toBe(
      'Dra. Yolanda Mendoza'
    );
    expect(document.querySelectorAll('#questionsContainer .question').length).toBe(2);
    expect((global as any).alert).toHaveBeenCalledWith('Progress loaded!');

    // And re-saving upgrades the stored copy in place, losslessly as
    // far as the written version allows (v1 writes carry no v2 tags).
    saveProgress();
    const upgraded = JSON.parse(localStorage.getItem('quizData') as string);
    expect(upgraded.schemaVersion).toBe(WRITTEN_VERSION);
    if (WRITTEN_VERSION !== CURRENT_VERSION) {
      expect(upgraded).not.toHaveProperty('tags');
    }
    expect(upgraded.title).toBe('Frogs of the Pampas');
    expect(upgraded.questions.length).toBe(2);
  });

  test('a corrupt save fails with a parse toast instead of throwing', async () => {
    document.body.innerHTML = fullSetupDOM();
    await import('../../src/ui.js');
    localStorage.setItem('quizData', '}{ not json');
    (document.getElementById('quizTitle') as HTMLInputElement).value = 'untouched';

    expect(() => loadProgress()).not.toThrow();
    expect((document.getElementById('quizTitle') as HTMLInputElement).value).toBe(
      'untouched'
    );
    const toast = (global as any).alert.mock.calls.at(-1)[0] as string;
    expect(toast).toContain('Failed to import quiz data.');
    expect(toast.toLowerCase()).toContain('not valid json');
  });

  test('a save from a future version is refused with guidance', async () => {
    document.body.innerHTML = fullSetupDOM();
    await import('../../src/ui.js');
    localStorage.setItem(
      'quizData',
      JSON.stringify({
        schemaVersion: CURRENT_VERSION + 1,
        title: 'From Tomorrow',
        teacherName: '',
        instructions: '',
        date: '',
        tags: {},
        questions: [],
      })
    );

    loadProgress();
    const toast = (global as any).alert.mock.calls.at(-1)[0] as string;
    expect(toast.toLowerCase()).toContain('newer');
    expect(toast).toContain(String(CURRENT_VERSION + 1));
    // The failed load must not clobber the live form.
    expect((document.getElementById('quizTitle') as HTMLInputElement).value).toBe('My Quiz');
  });

  test('no saved progress still toasts the friendly notice', async () => {
    document.body.innerHTML = fullSetupDOM();
    await import('../../src/ui.js');
    localStorage.removeItem('quizData');
    loadProgress();
    expect((global as any).alert).toHaveBeenCalledWith('No saved progress found.');
  });
});
