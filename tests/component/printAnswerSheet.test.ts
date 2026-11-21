import { describe, expect, test, vi } from 'vitest';
import { printAnswerSheet } from '../../src/ui.js';
import { clickButton } from '../setup';

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" value="Answer"><input id="teacherName"><input id="quizDate"><textarea id="instructions"></textarea>
    <div class="button-group"
    >
      <button>Print Answer Sheet</button>
    </div>`;
}

describe('Print Answer Sheet button', () => {
  test('creates a blob link with answer_sheet.doc', async () => {
    setupDOM();
    await import('../../src/ui.js');
    // Mock click to avoid navigation
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    printAnswerSheet();
    expect(clickSpy).toHaveBeenCalled();
    expect((global as any).URL.createObjectURL).toHaveBeenCalled();
  });
});
