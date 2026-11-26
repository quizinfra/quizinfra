// src/schema/migrations.js
// The ordered migration chain. CURRENT_VERSION is DERIVED from it (last
// `to`), so adding a version means exactly: create the vN directory
// (schema.json, quiz.js with the shape table + wrappers + the hop from
// vN-1, samples/, invalid/), and append one entry here. A missing or
// skipped step (1 -> 3) fails the contiguity test in
// tests/unit/migrations.test.ts, never ships silently.

import { migrateV1ToV2 } from "./v2/quiz.js";

/**
 * @typedef {object} Migration
 * @property {number} from    schemaVersion this hop consumes
 * @property {number} to      schemaVersion it produces
 * @property {(data: object) => object} migrate  pure v(from) -> v(to)
 */

/** @type {Migration[]} */
export const migrations = [
  { from: 1, to: 2, migrate: migrateV1ToV2 },
];
