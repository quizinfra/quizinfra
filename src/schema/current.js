// src/schema/current.js
// The two versions that define this build's persistence contract.
//
// CURRENT_VERSION is the version this build READS. Derived from the
// migration chain so it cannot drift from it; when no migrations exist
// yet the current version is, by definition, 1.
//
// WRITTEN_VERSION is the version this build WRITES — the release knob.
// Files are stamped with it and reduced to exactly the fields that
// version knows (serializeQuiz runs them through its normalize), so a
// not-yet-released version's fields can never leak onto disk ahead of
// it. Keep WRITTEN_VERSION <= CURRENT_VERSION; flip it to
// CURRENT_VERSION to release the new format.
//
// While WRITTEN_VERSION lags behind CURRENT_VERSION, fields only the
// newer versions know are read-and-migrated in memory but cannot
// survive persistence: with the pin at 1, the v2 `tags` bag is dropped
// on every save/export (it comes back as {} on re-import). Tests that
// assert wire-level shape branch on this knob.

import { migrations } from "./migrations.js";

export const CURRENT_VERSION =
  migrations.length === 0 ? 1 : migrations[migrations.length - 1].to;

export const WRITTEN_VERSION = 1;
