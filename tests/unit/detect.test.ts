import { describe, expect, test } from "vitest";
import {
  detectLanguage,
  matchTag,
  normalizeTag,
} from "../../src/i18n/detect.js";

const supported = ["en", "es", "fr"];

describe("normalizeTag / matchTag", () => {
  test("normalizes case and whitespace", () => {
    expect(normalizeTag("  EN-US ")).toBe("en-us");
    expect(normalizeTag(null)).toBe("");
  });
  test("matchTag falls back from region to base tag", () => {
    expect(matchTag("es-MX", supported)).toBe("es");
    expect(matchTag("fr", supported)).toBe("fr");
    expect(matchTag("de", supported)).toBeNull();
    expect(matchTag("", supported)).toBeNull();
  });
});

describe("detectLanguage", () => {
  test("URL override wins over stored and browser languages", () => {
    expect(
      detectLanguage({
        urlLang: "fr",
        stored: "es",
        navigatorLanguages: ["en-US"],
        supported,
        fallback: "en",
      })
    ).toBe("fr");
  });
  test("stored preference wins over browser languages", () => {
    expect(
      detectLanguage({
        stored: "es",
        navigatorLanguages: ["fr-FR"],
        supported,
        fallback: "en",
      })
    ).toBe("es");
  });
  test("browser languages are used next, first supported wins", () => {
    expect(
      detectLanguage({
        stored: null,
        navigatorLanguages: ["de-DE", "es-MX", "fr"],
        supported,
        fallback: "en",
      })
    ).toBe("es");
  });
  test("falls back when nothing matches", () => {
    expect(
      detectLanguage({
        stored: null,
        navigatorLanguages: ["de-DE"],
        supported,
        fallback: "en",
      })
    ).toBe("en");
  });
  test("unsupported URL override is ignored", () => {
    expect(
      detectLanguage({
        urlLang: "xx",
        stored: "es",
        navigatorLanguages: [],
        supported,
        fallback: "en",
      })
    ).toBe("es");
  });
});
