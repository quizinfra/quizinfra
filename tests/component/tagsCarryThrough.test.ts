// The `tags` bag is DATA-ONLY for now (the tag editor UI is a separate
// workstream): the app must neither render nor destroy tags. These
// tests pin that contract: the shipped form exposes no tag UI, yet
// imported bags survive into state untouched — and onto the wire as
// far as WRITTEN_VERSION allows (while the writer is pinned behind the
// reader, v1 writes legitimately carry no tags field; state itself
// always holds a well-typed bag).

import { describe, expect, test } from "vitest";
import { getQuizData, setQuizData, clearQuiz } from "../../src/ui.js";
import { serializeQuiz } from "../../src/quizData.js";
import { importQuiz, CURRENT_VERSION, WRITTEN_VERSION } from "../../src/schema/index.js";

function setupDOM() {
  document.body.innerHTML = `
    <input id="quizTitle" value="" />
    <input id="teacherName" value="" />
    <textarea id="instructions"></textarea>
    <input id="quizDate" value="" />
    <div id="questionsContainer"></div>
  `;
  // quizData (including the tag bag) is module-level state shared by
  // every test in this file; reset it so runs are independent.
  setQuizData({ title: "", teacherName: "", instructions: "", date: "", questions: [], tags: {} });
}

describe("tags are carry-through data (no UI yet)", () => {
  test("the app exposes no tag editor surface", () => {
    setupDOM();
    // No markup, no window handlers: a future tag UI will add its own
    // tests; this one guards against accidentally shipping half of one.
    expect(document.querySelector("#tagsContainer")).toBeNull();
    expect((window as any).addTag).toBeUndefined();
    expect((window as any).removeTag).toBeUndefined();
    expect((window as any).updateTagKey).toBeUndefined();
    expect((window as any).renderTags).toBeUndefined();
  });

  test("a tagless app still writes schema-valid files (empty bag in state)", () => {
    setupDOM();
    const payload = getQuizData();
    expect(payload.tags).toEqual({});
    // The required-tags rule of v2 holds on every file this writes.
    expect(() => importQuiz(serializeQuiz(payload))).not.toThrow();
  });

  test("imported bags land in state verbatim, re-exported intact", () => {
    setupDOM();
    // Built via JSON.parse (like the real import path): a source-code
    // literal with a "__proto__" key would set the *prototype*, not
    // create an own property — only parsed data carries it ordinarily.
    const bag = JSON.parse('{"unit":"Amphibians","difficulty":"easy","__proto__":"inert"}');
    setQuizData({
      title: "", teacherName: "", instructions: "", date: "",
      questions: [], tags: bag,
    });
    const tags = getQuizData().tags;
    expect(Object.keys(tags)).toEqual(["unit", "difficulty", "__proto__"]);
    expect(Object.getPrototypeOf(tags)).toBe(Object.prototype);

    const wire = JSON.parse(serializeQuiz(getQuizData()));
    if (WRITTEN_VERSION === CURRENT_VERSION) {
      expect(Object.keys(wire.tags)).toEqual(["unit", "difficulty", "__proto__"]);
      expect(wire.tags["__proto__"]).toBe("inert");
    } else {
      // Writer pinned behind the reader: the bag stays intact in state
      // but the v1 wire form has no tags field at all.
      expect(wire).not.toHaveProperty("tags");
    }
    expect(() => importQuiz(JSON.stringify(wire))).not.toThrow();
  });

  test("setQuizData without a bag and clearQuiz both yield the empty bag", () => {
    setupDOM();
    setQuizData({ title: "", teacherName: "", instructions: "", date: "", questions: [] });
    expect(getQuizData().tags).toEqual({});

    setQuizData({ title: "", teacherName: "", instructions: "", date: "", questions: [],
      tags: { x: "y" } });
    clearQuiz();
    expect(getQuizData().tags).toEqual({});
  });

  test("tags survive a localStorage save/load cycle as far as the written version allows", () => {
    setupDOM();
    const bag = { "school-code": "ESC-0417", unit: "Amphibians" };
    setQuizData({ title: "T", teacherName: "", instructions: "", date: "",
      questions: [], tags: bag });
    localStorage.setItem("quizData", serializeQuiz(getQuizData()));

    clearQuiz();
    expect(getQuizData().tags).toEqual({});

    const { data } = importQuiz(localStorage.getItem("quizData") as string);
    setQuizData(data);
    // Released: the bag comes back intact. Pinned behind the reader:
    // the save legitimately carried no tags, so state lands on the
    // empty-bag default.
    expect(getQuizData().tags).toEqual(
      WRITTEN_VERSION === CURRENT_VERSION ? bag : {}
    );
  });
});
