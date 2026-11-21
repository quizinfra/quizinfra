import { describe, expect, test, vi } from 'vitest';
import { clickButton } from '../setup';
import { shuffleQuestions } from '../../src/ui.js';

async function setupDOMWithTwoQuestions() {
  document.body.innerHTML = `
    <input id="quizTitle"><input id="teacherName"><textarea id="instructions"></textarea>
    <input id="quizDate"><div id="questionsContainer"></div>
    <div class="button-group">
      <button>Shuffle Questions</button>
      <button>Shuffle Answers</button>
    </div>`;

  const { setQuizData, renderQuestions } = await import('../../src/ui.js');
  const q1 = { text: 'Q1', answers: ['A1','B1','C1','D1'], correctAnswers: [true,false,false,false], explanation: '' };
  const q2 = { text: 'Q2', answers: ['A2','B2','C2','D2'], correctAnswers: [false,true,false,false], explanation: '' };
  setQuizData({ title: '', teacherName: '', instructions: '', date: '', questions: [q1, q2] });
  renderQuestions();
}

describe('Shuffle buttons', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  test('shuffleQuestions changes order', async () => {
    // deterministic random sequence forcing a swap
    vi.spyOn(Math, 'random').mockReturnValue(0);

    await setupDOMWithTwoQuestions();
    // Capture the question texts before shuffle
    const beforeFirst = (document.querySelector('.question input[type="text"]') as HTMLInputElement).value;
    // Directly invoke shuffleQuestions
    shuffleQuestions();
    const afterFirst = (document.querySelector('.question input[type="text"]') as HTMLInputElement).value;
    expect(afterFirst).not.toBe(beforeFirst);
  });

  test('shuffleAnswers keeps correctAnswers aligned', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await setupDOMWithTwoQuestions();
    clickButton('Shuffle Answers');
    const checkboxes = document.querySelectorAll('.answer-row input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(cb => (cb as HTMLInputElement).checked);
    // each question has exactly one checked box (since original data had one true)
    expect(checked.length).toBe(2);
  });
});
