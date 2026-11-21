import { describe, expect, test } from 'vitest';
import { previewQuiz } from '../../src/ui.js';
import { clickButton } from '../setup';

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" value="Demo">
    <input id="teacherName" value="T">
    <input id="quizDate" value="2026">
    <textarea id="instructions">Some instructions</textarea>
    <div id="questionsContainer"></div>

    <div id="previewModal" class="modal" style="display:none;">
      <div class="modal-content">
        <div id="previewContent"></div>
      </div>
    </div>

    <div class="button-group">
      <button>Preview Quiz</button>
    </div>`;
}

describe('Preview Quiz button', () => {
  test('opens the preview modal with correct markup', async () => {
    setupDOM();
    await import('../../src/ui.js');
    // Direct call
    previewQuiz();
    const modal = document.getElementById('previewModal')!;
    expect(modal.style.display).toBe('block');
    const preview = document.getElementById('previewContent')!;
    expect(preview.innerHTML).toContain('Demo');
    expect(preview.innerHTML).toContain('Some instructions');
  });
});
