import { describe, expect, test, vi } from "vitest";
import { fireEvent, getByText } from "@testing-library/dom";

// Import the UI module after the DOM is set up.
// The module attaches its functions to window for the inline handlers.

describe("Import Quiz Data button", () => {
  test("opens hidden file input when clicked", async () => {
    // Set up a minimal DOM that mirrors the relevant part of index.html
    document.body.innerHTML = `
      <input id="importFileInput" type="file" style="display:none;" onchange="handleFileImport(event)">
      <button id="importBtn">Import Quiz Data</button>
    `;

    // Spy on the hidden input's click method
    const hidden = document.getElementById("importFileInput") as HTMLInputElement;
    const clickSpy = vi.spyOn(hidden, "click");

    // Load the UI module (which registers the functions on window)
    await import("../../src/ui.js");

    // Simulate user clicking the visible button
    const btn = getByText(document.body, "Import Quiz Data");
    fireEvent.click(btn);

    expect(clickSpy).toHaveBeenCalledOnce();
  });
});
