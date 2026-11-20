import { describe, expect, test } from "vitest";
import { setQuizData, renderQuestions } from "../../src/ui.js";

/**
 * This test ensures that when quiz data containing a single quote in a question
 * text is loaded via the UI helpers, the generated input field retains the full
 * string. The current implementation uses an HTML attribute with single quotes,
 * which truncates at the quote – the test is expected to fail until the bug is
 * fixed.
 */

describe("Import Quiz Data handling", () => {
  test("question text with single quote is not truncated after rendering", () => {
    // Set up a minimal DOM structure required by setQuizData / renderQuestions.
    document.body.innerHTML = `
      <input id="quizTitle" />
      <input id="teacherName" />
      <textarea id="instructions"></textarea>
      <input id="quizDate" />
      <div id="questionsContainer"></div>
    `;

    const quiz = {
      title: "Demo",
      teacherName: "Teacher",
      instructions: "",
      date: "",
      questions: [
        {
          text: "Bob's favorite color?",
          answers: ["Red", "Blue", "Green", "Yellow"],
          correctAnswers: [false, true, false, false],
          explanation: "",
        },
      ],
    };

    // Load the data into the UI and render the question inputs.
    setQuizData(quiz);
    renderQuestions();

    const questionInput = document.querySelector('.question input[type="text"]') as HTMLInputElement;
    expect(questionInput).not.toBeNull();
    // The value should contain the full text with the single quote.
    expect(questionInput.value).toBe("Bob's favorite color?");
  });
});
