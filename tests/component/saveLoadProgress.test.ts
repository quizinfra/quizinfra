import { describe, expect, test } from 'vitest';
import { saveProgress, loadProgress } from '../../src/ui.js';
import { clickButton } from '../setup';

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

describe('Save / Load Progress', () => {
  test('stores and restores quiz data via localStorage', async () => {
    // Ensure the container exists for renderQuestions during loadProgress
    document.body.innerHTML = `
      <input id="quizTitle" value="My Quiz">
      <input id="teacherName" value="Prof X">
      <textarea id="instructions">Instr</textarea>
      <input id="quizDate" value="2026-11-21">
      <div id="questionsContainer"></div>
      <div class="button-group">
        <button>Save Progress</button>
        <button>Load Progress</button>
      </div>`;
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
});
