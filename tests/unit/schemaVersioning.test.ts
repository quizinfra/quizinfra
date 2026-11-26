// Version detection and the type-strict, presence-lenient import error
// taxonomy, exercised through the real pipeline (importQuiz) — the
// behaviour teachers get when they hand-edit a file or open one from
// the future.

import { describe, expect, test } from "vitest";
import {
  detectVersion,
  importQuiz,
  CURRENT_VERSION,
} from "../../src/schema/index.js";
import {
  QuizImportError,
  QuizDataError,
  UnsupportedSchemaVersionError,
} from "../../src/schema/errors.js";

/** Run importQuiz, returning the thrown error instead of failing the test. */
function capture(text: string): unknown {
  try {
    importQuiz(text);
    return undefined;
  } catch (err) {
    return err;
  }
}

const aV1File = JSON.stringify({
  title: "Detection Probe",
  teacherName: "T",
  instructions: "",
  date: "",
  questions: [],
});

const aV2File = JSON.stringify({
  schemaVersion: 2,
  title: "Detection Probe",
  teacherName: "T",
  instructions: "",
  date: "",
  tags: {},
  questions: [],
});

describe("detectVersion", () => {
  test("missing schemaVersion means legacy v1", () => {
    expect(detectVersion(JSON.parse(aV1File))).toBe(1);
  });

  test("an explicit integer is honoured", () => {
    expect(detectVersion(JSON.parse(aV2File))).toBe(2);
    // v1 files that were stamped by hand (or by a v1-era build that
    // always wrote the stamp) are still v1.
    expect(detectVersion({ schemaVersion: 1, title: "", teacherName: "", instructions: "", date: "", questions: [] })).toBe(1);
  });

  test("non-object payloads are QuizDataErrors", () => {
    for (const bad of ['[1,2]', '"just a string"', "null", "42", "true"]) {
      expect(capture(bad)).toBeInstanceOf(QuizDataError);
    }
  });

  test("non-integer / out-of-range schemaVersion values are rejected", () => {
    const base = { title: "", teacherName: "", instructions: "", date: "", tags: {}, questions: [] };
    for (const bad of ["2", 2.5, 0, -3, true, null, {}, []]) {
      const err = capture(JSON.stringify({ ...base, schemaVersion: bad }));
      expect(err, `schemaVersion ${JSON.stringify(bad)}`).toBeInstanceOf(QuizDataError);
    }
  });

  test("a file from the future refuses loudly", () => {
    const future = { ...JSON.parse(aV2File), schemaVersion: CURRENT_VERSION + 1 };
    const err = capture(JSON.stringify(future));
    expect(err).toBeInstanceOf(UnsupportedSchemaVersionError);
    expect((err as UnsupportedSchemaVersionError).version).toBe(CURRENT_VERSION + 1);
    expect((err as UnsupportedSchemaVersionError).supportedVersion).toBe(CURRENT_VERSION);
  });
});

describe("importQuiz (type-strict, presence-lenient, end to end)", () => {
  test("malformed JSON is a parse-level QuizImportError, not a schema error", () => {
    const err = capture("definitely not json {{{");
    expect(err).toBeInstanceOf(QuizImportError);
    expect(err).not.toBeInstanceOf(QuizDataError);
    expect((err as Error).message).toContain("not valid JSON");
  });

  test("empty input is a parse error", () => {
    expect(capture("")).toBeInstanceOf(QuizImportError);
  });

  test("a legacy v1 file imports to the current shape", () => {
    const result = importQuiz(aV1File);
    expect(result.fromVersion).toBe(1);
    expect(result.migrated).toBe(true);
    expect(result.data.schemaVersion).toBe(CURRENT_VERSION);
    expect(result.data.tags).toEqual({});
  });

  test("a current-version file imports untouched", () => {
    const result = importQuiz(aV2File);
    expect(result.fromVersion).toBe(2);
    expect(result.migrated).toBe(false);
    expect(result.data).toEqual(JSON.parse(aV2File));
  });

  test("a sparse file imports to the fully defaulted current shape", () => {
    // Presence is lenient: an empty object is a legal v1 file, and the
    // normalize stage fills every field with its documented default.
    const result = importQuiz("{}");
    expect(result.fromVersion).toBe(1);
    expect(result.migrated).toBe(true);
    expect(result.data).toEqual({
      schemaVersion: CURRENT_VERSION,
      title: "",
      teacherName: "",
      instructions: "",
      date: "",
      tags: {},
      questions: [],
    });
  });

  test("hand-edited garbage carries the full issue list", () => {
    const sloppy = JSON.parse(aV1File);
    sloppy.title = 42; // wrong type
    sloppy.instructions = null; // wrong type
    sloppy.questions = [
      { text: "q", answers: ["a", 1, "c", "d"], correctAnswers: [true, "false"] },
    ];
    const err = capture(JSON.stringify(sloppy));
    expect(err).toBeInstanceOf(QuizDataError);
    const issues = (err as QuizDataError).issues;
    // Everything wrong is reported at once — one fixing pass suffices.
    expect(issues.some(i => i.includes("title")), "mistyped title").toBe(true);
    expect(issues.some(i => i.includes("instructions")), "mistyped instructions").toBe(true);
    expect(issues.some(i => i.includes("questions[0].answers[1]")), "mistyped answer item").toBe(true);
    expect(issues.some(i => i.includes("questions[0].correctAnswers[1]")), "mistyped flag item").toBe(true);
  });

  test("unknown properties are ignored, not issues", () => {
    // The type half of the policy stays strict; the presence half is
    // fully lenient: fields the claimed version does not define are
    // dropped by the whitelist-built normalizers, at quiz level and at
    // question level alike.
    const withExtras = JSON.parse(aV1File);
    withExtras.notes = "added by hand";
    withExtras.questions = [
      { text: "q", answers: ["a"], correctAnswers: [true], bonus: "unknown question field" },
    ];
    const result = importQuiz(JSON.stringify(withExtras));
    expect(result.data).not.toHaveProperty("notes");
    expect(result.data.questions[0]).not.toHaveProperty("bonus");
  });

  test("option cardinality is free at the data model", () => {
    // The four-option editor layout is a ui.js policy; the pipeline
    // accepts any (type-correct) answers/correctAnswers length, and
    // absent option lists fill as [] rather than a fixed four.
    const flexible = JSON.parse(aV1File);
    flexible.questions = [
      { text: "two options", answers: ["a", "b"], correctAnswers: [true, false] },
      { text: "no options at all", correctAnswers: [] },
    ];
    const result = importQuiz(JSON.stringify(flexible));
    expect(result.data.questions[0].answers).toEqual(["a", "b"]);
    expect(result.data.questions[1].answers).toEqual([]);
    expect(result.data.questions[1].correctAnswers).toEqual([]);
  });

  test("the stamp, not the contents, decides the claimed version", () => {
    // An unstamped file is v1 no matter what it carries; v1 has no
    // tags bag, and a field the claimed version does not know is
    // ignored — so a forgetful v2 save loses its bag to the empty one
    // filled by the migration.
    const forgetfulV2 = JSON.parse(aV2File);
    forgetfulV2.tags = { sneaky: "yes" };
    delete forgetfulV2.schemaVersion;
    const result = importQuiz(JSON.stringify(forgetfulV2));
    expect(result.fromVersion).toBe(1);
    expect(result.data.tags).toEqual({});
  });
});
