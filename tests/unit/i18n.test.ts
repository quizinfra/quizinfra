import { describe, expect, test } from "vitest";
import {
  t,
  setLocale,
  getLocale,
  SUPPORTED_LOCALES,
} from "../../src/i18n/index.js";

describe("t()", () => {
  test("resolves nested keys", () => {
    expect(t("toast.loaded")).toBe("Progress loaded!");
    expect(t("form.teacher_name")).toBe("Teacher");
  });
  test("interpolates {{params}}", () => {
    expect(t("question.heading", { n: 3 })).toBe("Question 3");
    expect(t("answer_sheet.heading", { title: "Fractions" })).toBe(
      "Fractions - Answer Sheet"
    );
  });
  test("escapes interpolated params", () => {
    expect(t("answer_sheet.heading", { title: "<b>x</b>" })).toContain(
      "&lt;b&gt;"
    );
  });
  test("missing key renders as the key itself", () => {
    expect(t("does.not.exist")).toBe("does.not.exist");
  });
  test("leaves unmatched placeholders alone", () => {
    expect(t("question.heading")).toBe("Question {{n}}");
  });
  test("setLocale rejects unsupported locales", () => {
    expect(setLocale("xx")).toBe(false);
    expect(getLocale()).toBe("en");
    expect(SUPPORTED_LOCALES).toContain("en");
  });
});
