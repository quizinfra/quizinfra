import { describe, expect, test } from "vitest";
import {
  SUPPORTED_LOCALES,
  FALLBACK_LOCALE,
  t,
  setLocale,
  getLocale,
} from "../../src/i18n/index.js";

import enUi from "../../src/i18n/locales/en/ui.json";
import enDocs from "../../src/i18n/locales/en/docs.json";
import esUi from "../../src/i18n/locales/es/ui.json";
import esDocs from "../../src/i18n/locales/es/docs.json";
import frUi from "../../src/i18n/locales/fr/ui.json";
import frDocs from "../../src/i18n/locales/fr/docs.json";

const namespaceFiles: Record<string, Record<string, unknown>> = {
  en: { ...enUi, ...enDocs },
  es: { ...esUi, ...esDocs },
  fr: { ...frUi, ...frDocs },
};

/** Recursively collect all leaf keys of a nested message tree. */
function collectKeys(tree: unknown, prefix = ""): string[] {
  if (tree !== null && typeof tree === "object") {
    return Object.entries(tree as Record<string, unknown>).flatMap(
      ([k, v]) => collectKeys(v, prefix ? `${prefix}.${k}` : k)
    );
  }
  return typeof tree === "string" ? [prefix] : [];
}

const enKeys = collectKeys(namespaceFiles[FALLBACK_LOCALE]).sort();

describe("locale registry", () => {
  test("es and fr are registered as supported locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(expect.arrayContaining(["en", "es", "fr"]));
  });

  for (const locale of ["es", "fr"]) {
    test(`${locale} has exactly the same keys as the en source locale`, () => {
      const keys = collectKeys(namespaceFiles[locale]).sort();
      const missing = enKeys.filter(k => !keys.includes(k));
      const extra = keys.filter(k => !enKeys.includes(k));
      // Report both directions explicitly for actionable failures.
      expect(missing, `keys missing from ${locale}`).toEqual([]);
      expect(extra, `keys only present in ${locale}`).toEqual([]);
      expect(keys).toEqual(enKeys);
    });

    test(`${locale} values are actually translated (not copied en values verbatim)`, () => {
      // Sanity check a few high-visibility strings. (Legitimate
      // identical strings exist — e.g. "Instructions"/"Instructions" —
      // so we only pin unambiguous ones.)
      setLocale(locale);
      try {
        expect(t("actions.save_progress")).not.toBe(
          enUi.actions.save_progress
        );
        expect(t("toast.saved")).not.toBe(enUi.toast.saved);
      } finally {
        setLocale(FALLBACK_LOCALE);
      }
    });
  }

  test("{{param}} placeholders survive translation", () => {
    for (const locale of SUPPORTED_LOCALES) {
      setLocale(locale);
      try {
        expect(getLocale()).toBe(locale);
        // The interpolation param must be present in every translation,
        // otherwise the rendered heading would lose its number.
        expect(t("question.heading")).toContain("{{n}}");
        expect(t("answer_sheet.heading")).toContain("{{title}}");
      } finally {
        setLocale(FALLBACK_LOCALE);
      }
    }
  });
});
