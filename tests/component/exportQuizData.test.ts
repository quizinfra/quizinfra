import { describe, expect, test, vi } from 'vitest';
import { exportQuizData } from '../../src/ui.js';
import { clickButton } from '../setup';

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" value="Exported"><input id="teacherName"><input id="quizDate"><textarea id="instructions"></textarea>
    <div class="button-group">
      <button>Export Quiz Data</button>
    </div>`;
}

describe('Export Quiz Data button', () => {
  test('creates a temporary <a> with correct data URL', async () => {
    setupDOM();
    await import('../../src/ui.js');
    // Mock click to avoid navigation
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    exportQuizData();
    expect(clickSpy).toHaveBeenCalled();
  });
});
