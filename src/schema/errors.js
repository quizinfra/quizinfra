// src/schema/errors.js
// Typed errors thrown by the schema/import pipeline. They carry
// machine-readable detail (`issues`, `version`) and an English technical
// message meant for the console; user-facing toasts are translated in
// ui.js by discriminating on these classes. All derive from
// QuizImportError so callers can catch the whole family with one catch.

/** Base class: anything that can go wrong while importing quiz data. */
export class QuizImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "QuizImportError";
  }
}

/**
 * The payload does not match the schema of the version it claims to be.
 * `issues` lists every violation found (validation is exhaustive: we
 * report all problems, not just the first, so fixing a file takes one
 * pass). The message is the issues joined; callers that need structure
 * read `issues`.
 */
export class QuizDataError extends QuizImportError {
  constructor(message, issues) {
    super(message);
    this.name = "QuizDataError";
    this.issues = Array.isArray(issues) ? issues : [message];
  }
}

/**
 * The file declares a schemaVersion newer than this build understands
 * (e.g. opened with an outdated copy of the single-file artifact). The
 * import is refused: guessing at a newer shape risks silent corruption
 * of the teacher's data on the next export.
 */
export class UnsupportedSchemaVersionError extends QuizImportError {
  constructor(version, supportedVersion) {
    super(
      `file declares schemaVersion ${version}, but this build supports at most ${supportedVersion}`
    );
    this.name = "UnsupportedSchemaVersionError";
    this.version = version;
    this.supportedVersion = supportedVersion;
  }
}
