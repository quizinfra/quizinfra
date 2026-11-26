import { describe, expect, test } from "vitest";
import { buildQuizPayload, serializeQuiz } from "../../src/quizData.js";
import { importQuiz, CURRENT_VERSION, WRITTEN_VERSION, getVersionOrThrow } from "../../src/schema/index.js";

describe("Quiz payload serialization", () => {
  test("the written version never outruns the reader", () => {
    // The release knob in src/schema/current.js: writing a version the
    // reader or the registry does not know would forge files this very
    // build cannot import.
    expect(WRITTEN_VERSION).toBeLessThanOrEqual(CURRENT_VERSION);
    expect(() => getVersionOrThrow(WRITTEN_VERSION)).not.toThrow();
  });
  test("preserves single quotes in every field", () => {
    // Minimal DOM mocks – only .value is accessed
    const mockInput = (val: string) => ({ value: val } as unknown as HTMLInputElement);
    const mockTextarea = (val: string) => ({ value: val } as unknown as HTMLTextAreaElement);

    const title = mockInput("Bob's Awesome Quiz");
    const teacher = mockInput("Mrs. O'Connor");
    const instr = mockTextarea("Answer the following questions, don't cheat!");
    const date = mockInput("2026-12-01");

    const questions = [
      {
        text: "What’s the capital of France?",
        answers: ["Paris", "Lyon", "Marseille", "Nice"],
        correctAnswers: [true, false, false, false],
        explanation: "",
      },
    ];

    const payload = buildQuizPayload(title, teacher, instr, date, questions);
    const json = serializeQuiz(payload);

    // The JSON string must contain the full text with the single‑quote preserved.
    expect(json).toContain("Bob's Awesome Quiz");
    expect(json).toContain("Mrs. O'Connor");
  });

  test("stamps the written schemaVersion at the front of every file", () => {
    const mockInput = (val: string) => ({ value: val } as unknown as HTMLInputElement);
    const mockTextarea = (val: string) => ({ value: val } as unknown as HTMLTextAreaElement);
    const payload = buildQuizPayload(
      mockInput("Stamped"),
      mockInput("Teacher"),
      mockTextarea(""),
      mockInput(""),
      [],
      { unit: " stamps " }
    );
    const json = serializeQuiz(payload);
    expect(
      json.startsWith(`{"schemaVersion":${WRITTEN_VERSION},`)
    ).toBe(true);

    // A stale stamp on the payload must not survive the fresh stamp.
    const stale = serializeQuiz({ schemaVersion: 99, ...payload });
    expect(stale.startsWith(`{"schemaVersion":${WRITTEN_VERSION},`)).toBe(true);
    expect(stale).not.toContain("99");
  });

  test("the tag bag round-trips through serialize + import", () => {
    const mockInput = (val: string) => ({ value: val } as unknown as HTMLInputElement);
    const mockTextarea = (val: string) => ({ value: val } as unknown as HTMLTextAreaElement);
    const tags = { unit: "Amphibians", "school-code": "ESC-0417" };
    const payload = buildQuizPayload(
      mockInput("Tag round trip"),
      mockInput("Teacher"),
      mockTextarea("Instructions"),
      mockInput("2026-07-01"),
      [],
      tags
    );
    const { data } = importQuiz(serializeQuiz(payload));
    if (WRITTEN_VERSION === CURRENT_VERSION) {
      expect(data.tags).toEqual(tags);
    } else {
      // Writer pinned behind the reader (v1): tags are read into state
      // but cannot be persisted yet, so the re-imported bag is empty.
      expect(data.tags).toEqual({});
    }
    // Missing tag state defaults to the empty bag in memory (never
    // undefined/null), so the app always holds a well-typed bag even
    // when the written version cannot persist one yet.
    const noTags = buildQuizPayload(
      mockInput("No tags"),
      mockInput("Teacher"),
      mockTextarea(""),
      mockInput(""),
      []
    );
    expect(noTags.tags).toEqual({});
  });
});
