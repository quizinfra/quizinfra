import { describe, expect, test } from 'vitest';
import { addQuestion } from '../../src/ui.js';
import { clickButton } from '../setup';

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle"/><input id="teacherName"/><textarea id="instructions"></textarea>
    <input id="quizDate"/><div id="questionsContainer"></div>
    <div class="button-group">
      <button>Add New Question</button>
    </div>`;
}

describe('Add Question button', () => {
  test('creates a new empty question in the UI', async () => {
    setupDOM();
    await import('../../src/ui.js');
    // Directly invoke the function instead of relying on inline onclick
    addQuestion();

    const questionDiv = document.querySelector('.question');
    expect(questionDiv).not.toBeNull();
    const textInput = questionDiv!.querySelector('input[type="text"]') as HTMLInputElement;
    expect(textInput.value).toBe('');
    // The four-option rows are a UI policy (the data model leaves
    // option cardinality free); guard that the editor still lays out 4.
    expect(questionDiv!.querySelectorAll('.answer-row').length).toBe(4);
  });
});
