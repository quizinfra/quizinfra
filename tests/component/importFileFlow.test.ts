// End-to-end component test for the "Import Quiz Data" button flow:
// real File + real FileReader through handleFileImport, asserting both
// the rendered UI and the user-facing toasts. (tests/compat owns the
// data matrix; this file owns the UI plumbing around it.)

import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleFileImport, getQuizData } from "../../src/ui.js";
import { CURRENT_VERSION, WRITTEN_VERSION } from "../../src/schema/index.js";
import { serializeQuiz } from "../../src/quizData.js";

const alertMock = global.alert as unknown as ReturnType<typeof vi.fn>;

const fixture = (...parts: string[]) =>
  readFileSync(join(process.cwd(), "src/schema", ...parts), "utf8");

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" />
    <input id="teacherName" />
    <textarea id="instructions"></textarea>
    <input id="quizDate" />
    <div id="questionsContainer"></div>
    <input id="importFileInput" type="file" />
  `;
}

/** Simulate the file input's change event for a given file contents. */
function importFile(text: string, name = "quiz_data.json") {
  const file = new File([text], name, { type: "application/json" });
  // jsdom does not execute inline onchange attributes; call the very
  // handler the attribute references — and prove the window binding
  // (what the attribute resolves against) is the same function.
  expect((window as any).handleFileImport).toBe(handleFileImport);
  return handleFileImport({ target: { files: [file], value: "" } });
}

describe("Import Quiz Data button — real file flow", () => {
  test("a legacy v1 file imports, renders and toasts success", async () => {
    setupDOM();
    const ok = await importFile(fixture("v1", "samples", "basic.json"));
    expect(ok).toBe(true);

    expect((document.getElementById("quizTitle") as HTMLInputElement).value).toBe(
      "Frogs of the Pampas"
    );
    expect((document.getElementById("teacherName") as HTMLInputElement).value).toBe(
      "Dra. Yolanda Mendoza"
    );
    expect(
        (document.getElementById("instructions") as HTMLTextAreaElement).value
    ).toBe("Circle the single correct answer for each question.");
    expect((document.getElementById("quizDate") as HTMLInputElement).value).toBe(
      "2026-03-14"
    );
    const questionContainers = document.querySelectorAll("#questionsContainer .question");
    expect(questionContainers.length).toBe(2);
    const firstTextInput = document.querySelector(
      '#questionsContainer .question input[type="text"]'
    ) as HTMLInputElement;
    expect(firstTextInput.value).toBe(
      "Which frog is endemic to the Wetlands of San Fernando?"
    );
    // v1 has no tags: the pipeline migrates it to the empty bag.
    expect(getQuizData().tags).toEqual({});
    expect(alertMock).toHaveBeenCalledWith("File imported");
  });

  test("v2 tags are carried through state intact, tricky values preserved", async () => {
    setupDOM();
    const text = fixture("v2", "samples", "tags.json");
    const ok = await importFile(text);
    expect(ok).toBe(true);

    const imported = JSON.parse(text);
    // There is no tag UI yet; the bag lives in state verbatim, including
    // the "__proto__" tag as ordinary data (and it stays ordinary data
    // through the spread-copy in setQuizData).
    expect(Object.keys(getQuizData().tags)).toEqual(Object.keys(imported.tags));
    expect(getQuizData().tags.__proto__).toBe("inert data, not prototype pollution");
    expect(Object.getPrototypeOf(getQuizData().tags)).toBe(Object.prototype);
    // And it survives serialisation for the wire, entry for entry — as
    // far as the written version knows the field at all.
    const roundTripped = JSON.parse(serializeQuiz(getQuizData()));
    if (WRITTEN_VERSION === CURRENT_VERSION) {
      expect(Object.keys(roundTripped.tags)).toEqual(Object.keys(imported.tags));
      expect(roundTripped.tags["unit"]).toBe("Amphibians & Reptiles");
      expect(roundTripped.tags["__proto__"]).toBe("inert data, not prototype pollution");
    } else {
      expect(roundTripped).not.toHaveProperty("tags");
    }
    expect(alertMock).toHaveBeenCalledWith("File imported");
  });

  test("quotes and markup characters in data survive rendering", async () => {
    setupDOM();
    const ok = await importFile(fixture("v1", "samples", "quotes.json"));
    expect(ok).toBe(true);
    expect((document.getElementById("quizTitle") as HTMLInputElement).value).toBe(
      "Bob's & Alice's Zoo Quiz <3"
    );
    expect((document.getElementById("teacherName") as HTMLInputElement).value).toBe(
      'Mr. O\'Keefe "The Keeper"'
    );
    const firstTextInput = document.querySelector(
      '#questionsContainer .question input[type="text"]'
    ) as HTMLInputElement;
    expect(firstTextInput.value).toBe(
      "Which one is the 'Poison Dart Frog' of the Amazon basin?"
    );
    // Nothing from the file executed as HTML/script.
    expect(document.querySelectorAll("#questionsContainer script").length).toBe(0);
    expect(document.querySelector("#questionsContainer b")).toBeNull();
  });

  test("a malformed file is refused with the validator's issue list, UI untouched", async () => {
    setupDOM();
    const title = document.getElementById("quizTitle") as HTMLInputElement;
    title.value = "untouched";

    const ok = await importFile(fixture("v1", "invalid", "answers-number-item.json"));
    expect(ok).toBe(false);
    expect(title.value).toBe("untouched");
    expect(document.querySelectorAll("#questionsContainer .question").length).toBe(0);
    const toast = alertMock.mock.calls.at(-1)?.[0] as string;
    expect(toast).toContain("Failed to import quiz data.");
    expect(toast).toContain("questions[0].answers[1]");
  });

  test("a file from the future is refused with an actionable toast", async () => {
    setupDOM();
    const future = {
      schemaVersion: CURRENT_VERSION + 1,
      title: "From Tomorrow",
      teacherName: "T",
      instructions: "",
      date: "",
      tags: {},
      questions: [],
    };
    const ok = await importFile(JSON.stringify(future));
    expect(ok).toBe(false);
    const toast = alertMock.mock.calls.at(-1)?.[0] as string;
    expect(toast).toContain(String(CURRENT_VERSION + 1));
    expect(toast.toLowerCase()).toContain("newer");
  });

  test("non-JSON content fails with a parse toast, not a crash", async () => {
    setupDOM();
    const ok = await importFile("<html><body>not json</body></html>");
    expect(ok).toBe(false);
    const toast = alertMock.mock.calls.at(-1)?.[0] as string;
    expect(toast).toContain("Failed to import quiz data.");
    expect(toast.toLowerCase()).toContain("not valid json");
  });

  test("choosing no file toasts the no-file notice", async () => {
    setupDOM();
    const handler = (window as any).handleFileImport;
    const ok = await handler({ target: { files: [], value: "" } });
    expect(ok).toBe(false);
    expect(alertMock).toHaveBeenCalledWith("No file selected.");
  });
});
