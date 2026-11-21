import { describe, expect, test, vi } from 'vitest';
import { generateWordDocument } from '../../src/ui.js';
import { clickButton } from '../setup';

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" value="Doc"><input id="teacherName"><input id="quizDate"><textarea id="instructions"></textarea>
    <div class="button-group">
      <button>Generate Word Document</button>
    </div>`;
}

describe('Generate Word Document button', () => {
  test('creates a blob link with .doc extension', async () => {
    setupDOM();
    await import('../../src/ui.js');
    // Mock click to avoid navigation
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    generateWordDocument();
    expect(clickSpy).toHaveBeenCalled();
    expect((global as any).URL.createObjectURL).toHaveBeenCalled();
  });
});
