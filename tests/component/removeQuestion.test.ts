import { describe, expect, test } from 'vitest';
import { removeQuestion } from '../../src/ui.js';
import { clickButton } from '../setup';

async function setupDOMWithOneQuestion() {
  document.body.innerHTML = `
    <input id="quizTitle"><input id="teacherName"><textarea id="instructions"></textarea>
    <input id="quizDate"><div id="questionsContainer"></div>
    <div class="button-group">
      <button>Add New Question</button>
    </div>`;

  const { setQuizData, renderQuestions } = await import('../../src/ui.js');
  const dummy = {
    text: 'Q?',
    answers: ['A', 'B', 'C', 'D'],
    correctAnswers: [false, true, false, false],
    explanation: ''
  };
  setQuizData({ title: '', teacherName: '', instructions: '', date: '', questions: [dummy] });
  renderQuestions();
}

describe('Remove Question button', () => {
  test('removes the rendered question', async () => {
    await setupDOMWithOneQuestion();
    // Direct call to removeQuestion
    removeQuestion(0);
    expect(document.querySelector('.question')).toBeNull();
  });
});
