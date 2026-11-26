// The migration chain's structural invariants plus unit tests for each
// hop. The contiguity assertions here are what make the pipeline's
// "no silent corruption" promise: a skipped or missing step fails CI
// instead of turning into a mysterious import error in a classroom.

import { describe, expect, test } from "vitest";
import { migrations } from "../../src/schema/migrations.js";
import { getVersionOrThrow, CURRENT_VERSION } from "../../src/schema/index.js";
import { QuizDataError } from "../../src/schema/errors.js";
import { migrateV1ToV2 } from "../../src/schema/v2/quiz.js";

describe("migration chain", () => {
  test("is sorted, contiguous and ends at CURRENT_VERSION", () => {
    migrations.forEach((step, index) => {
      expect(step.from, `hop ${index} starts where the previous ended`).toBe(index + 1);
      expect(step.to, `hop ${index} advances exactly one version`).toBe(index + 2);
      expect(typeof step.migrate).toBe("function");
    });
    const derived = migrations.length === 0 ? 1 : migrations[migrations.length - 1].to;
    expect(derived).toBe(CURRENT_VERSION);
  });

  test("getVersionOrThrow covers every version in the chain", () => {
    // The single version→SchemaVersion registry behind the validator,
    // the normalizer and the UI's blank questions (engine.js
    // interprets each version's table into all of them); a missing
    // case would throw at import time, so fail at test time instead.
    for (let version = 1; version <= CURRENT_VERSION; version++) {
      const shape = getVersionOrThrow(version).shape;
      expect(shape.quiz, `v${version} quiz table`).toBeInstanceOf(Object);
      expect(shape.question, `v${version} question table`).toBeInstanceOf(Object);
      // The additive-only model: every later version's field set is a
      // superset of the previous one's (fields are never renamed or
      // dropped — that is what lets vN/quiz.js extend v(N-1)'s table).
      if (version > 1) {
        for (const level of ["quiz", "question"]) {
          for (const field of Object.keys(getVersionOrThrow(version - 1).shape[level])) {
            expect(
              shape[level],
              `v${version}.${level} must still declare ${field}`
            ).toHaveProperty(field);
          }
        }
      }
    }
    // And an unregistered version is refused loudly, from one place.
    expect(() => getVersionOrThrow(CURRENT_VERSION + 1)).toThrow(QuizDataError);
  });

  test("the data-model blank question is the current table's fill", () => {
    // SchemaVersion#blankQuestion (which ui.js's addQuestion builds
    // on) and the normalizer's sparse-question fill are the same
    // decision from the same table: absent arrays are simply [] — the
    // editor's fixed option rows are a UI policy layered on top, not a
    // schema one.
    expect(getVersionOrThrow(CURRENT_VERSION).blankQuestion()).toEqual(
      getVersionOrThrow(CURRENT_VERSION).normalize({ questions: [{}] }).questions[0]
    );
  });
});

describe("migrateV1ToV2 field sets (migration-drop guard)", () => {
  // The schemas cannot catch a migration that silently DROPS a field
  // (presence is lenient), so the per-hop field sets are asserted here:
  // the whitelist-built output of a hop must always be complete.
  test("produces exactly the v2 quiz-level and question-level fields", () => {
    const complete = {
      schemaVersion: 1,
      title: "t",
      teacherName: "tn",
      instructions: "i",
      date: "d",
      questions: [
        {
          text: "q",
          answers: ["", "", "", ""],
          correctAnswers: [false, false, false, false],
          explanation: "e",
        },
      ],
    };
    const out = migrateV1ToV2(complete);
    expect(Object.keys(out).sort()).toEqual([
      "date",
      "instructions",
      "questions",
      "schemaVersion",
      "tags",
      "teacherName",
      "title",
    ]);
    expect(Object.keys(out.questions[0]).sort()).toEqual([
      "answers",
      "correctAnswers",
      "explanation",
      "text",
    ]);
    // And none of them may be undefined (a mis-wired whitelist entry).
    for (const value of Object.values(out)) {
      expect(value, `top-level field is defined`).not.toBeUndefined();
    }
    for (const value of Object.values(out.questions[0])) {
      expect(value, `question field is defined`).not.toBeUndefined();
    }
  });
});

describe("per-version normalize stage", () => {
  // Normalization fills absent fields with documented defaults and
  // never touches present values. These tests call the normalizers
  // directly (the pipeline wraps them); the golden-file samples in
  // tests/compat cover them end to end.
  const fillCases = [
    {
      version: 1,
      normalize: (raw) => getVersionOrThrow(1).normalize(raw),
      blank: {
        title: "", teacherName: "", instructions: "", date: "", questions: [],
      },
      blankQuestion: {
        text: "", answers: [], correctAnswers: [], explanation: "",
      },
    },
    {
      version: 2,
      normalize: (raw) => getVersionOrThrow(2).normalize(raw),
      blank: {
        title: "", teacherName: "", instructions: "", date: "", tags: {}, questions: [],
      },
      blankQuestion: {
        text: "", answers: [], correctAnswers: [], explanation: "",
      },
    },
  ];

  for (const { version, normalize, blank, blankQuestion } of fillCases) {
    test(`v${version}: an empty object fills with documented defaults`, () => {
      expect(normalize({})).toEqual(blank);
    });

    test(`v${version}: present values are carried through verbatim`, () => {
      const sparse = { title: "Kept", questions: [{ text: "Q?", answers: ["a", "b"] }] };
      if (version === 2) sparse.tags = { region: "north" };
      const out = normalize(JSON.parse(JSON.stringify(sparse)));
      expect(out.title).toBe("Kept");
      // Present arrays keep their (any) length verbatim; absent ones are
      // filled from the kind default.
      expect(out.questions[0]).toEqual({ ...blankQuestion, text: "Q?", answers: ["a", "b"] });
      if (version === 2) expect(out.tags).toEqual({ region: "north" });
    });

    test(`v${version}: never fabricates a schemaVersion stamp`, () => {
      expect(normalize({})).not.toHaveProperty("schemaVersion");
      const stamped = normalize({ schemaVersion: version, title: "t" });
      expect(stamped.schemaVersion).toBe(version);
    });

    test(`v${version}: never mutates its input (pure fill)`, () => {
      const input = {
        title: "Pristine",
        questions: [{ text: "Q?", answers: ["a", "b", "c", "d"] }],
      };
      if (version === 2) input.tags = { k: "v" };
      const before = JSON.parse(JSON.stringify(input));
      const out = normalize(input);
      // Wreck the output...
      out.title = "Mangled";
      out.questions[0].answers[0] = "Mangled";
      out.questions.push({ ...out.questions[0] });
      if (version === 2) out.tags.k = "Mangled";
      // ...and the input is untouched.
      expect(input).toEqual(before);
    });

    test(`v${version}: non-object questions pass through for the validator`, () => {
      // normalize must not invent a question where there is none; the
      // validator (which runs on the raw file first) rejects these.
      expect(normalize({ questions: ["not a question", 42] }).questions).toEqual([
        "not a question",
        42,
      ]);
    });
  }
});

describe("migrateV1ToV2", () => {
  const aV1Quiz = () => ({
    title: "Legacy Quiz",
    teacherName: "Mg. Beatriz",
    instructions: "Circle the answers",
    date: "2024-02-02",
    questions: [
      {
        text: "Legacy question?",
        answers: ["One", "Two", "Three", "Four"],
        correctAnswers: [false, true, false, false],
        explanation: "Because two.",
      },
    ],
  });

  test("stamps v2 and supplies the empty tag bag", () => {
    const out = migrateV1ToV2(aV1Quiz());
    expect(out.schemaVersion).toBe(2);
    expect(out.tags).toEqual({});
  });

  test("preserves every field of every question verbatim", () => {
    const input = aV1Quiz();
    const out = migrateV1ToV2(input);
    expect(out.title).toBe(input.title);
    expect(out.teacherName).toBe(input.teacherName);
    expect(out.instructions).toBe(input.instructions);
    expect(out.date).toBe(input.date);
    expect(out.questions).toEqual(input.questions);
  });

  test("never mutates its input (pure hop)", () => {
    const input = aV1Quiz();
    const before = JSON.parse(JSON.stringify(input));
    const out = migrateV1ToV2(input);
    // Wreck the output...
    out.title = "Mangled";
    out.questions[0].answers[0] = "Mangled";
    out.questions[0].correctAnswers[0] = true;
    out.questions.push({ ...out.questions[0] });
    // ...and the input is untouched.
    expect(input).toEqual(before);
  });

  test("drops any stale schemaVersion stamped on the v1 file", () => {
    // A hand-stamped legacy file still detects as v1 (the schema pins
    // the stamp to 1); the migration must not leak it into the v2 doc.
    const out = migrateV1ToV2({ schemaVersion: 1, ...aV1Quiz() });
    expect(out.schemaVersion).toBe(2);
  });

  test("deep-copies the per-question arrays", () => {
    const input = aV1Quiz();
    const out = migrateV1ToV2(input);
    expect(out.questions[0].answers).not.toBe(input.questions[0].answers);
    expect(out.questions[0].correctAnswers).not.toBe(input.questions[0].correctAnswers);
  });
});
