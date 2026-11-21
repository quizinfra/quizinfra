import { vi } from 'vitest';

import { fireEvent, getByText } from '@testing-library/dom';
declare const global: any;

// Mock global alert so tests can spy on it.
(global as any).alert = vi.fn();

// Mock URL.createObjectURL used by export/generate/print functions.
(global as any).URL.createObjectURL = vi.fn(() => 'blob:fake-url');

/** Helper to click a button by its visible text. */
export function clickButton(label: string) {
  fireEvent.click(getByText(document.body, label));
}
