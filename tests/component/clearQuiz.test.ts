import { describe, expect, test } from 'vitest';
import { clearQuiz } from '../../src/ui.js';
import { clickButton } from '../setup';

function setupDOMPopulated() {
  document.body.innerHTML = `
    <input id="quizTitle" value="Foo">
    <input id="teacherName" value="Bar">
    <textarea id="instructions">Baz</textarea>
    <input id="quizDate" value="2026-11-21">
    <div id="questionsContainer"><div class="question"></div></div>
    <div class="button-group">
      <button>Clear Quiz</button>
    </div>`;
}

describe('Clear Quiz button', () => {
  test('empties all fields and removes questions', async () => {
    setupDOMPopulated();
    await import('../../src/ui.js');
    // Direct call
    clearQuiz();
    expect((document.getElementById('quizTitle') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('teacherName') as HTMLInputElement).value).toBe('');
    expect((document.getElementById('instructions') as HTMLTextAreaElement).value).toBe('');
    expect((document.getElementById('quizDate') as HTMLInputElement).value).toBe('');
    expect(document.querySelector('.question')).toBeNull();
    expect((global as any).alert).toHaveBeenCalledWith('Quiz cleared!');
  });
});
