import { describe, expect, test } from "vitest";
import { buildQuizPayload, serializeQuiz } from "../../src/quizData.js";

describe("Quiz payload serialization", () => {
  test("preserves single quotes in every field", () => {
    // Minimal DOM mocks – only .value is accessed
    const mockInput = (val) => ({ value: val } as unknown as HTMLInputElement);
    const mockTextarea = (val) => ({ value: val } as unknown as HTMLTextAreaElement);

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
});
