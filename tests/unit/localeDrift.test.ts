import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "../../src/i18n/index.js";

// Vitest runs from the project root, so cwd + "index.html" is the real file.
// (import.meta.url is rewritten to an http:// URL by the jsdom environment,
// which fileURLToPath rejects.)
const htmlPath = join(process.cwd(), "index.html");
const html = readFileSync(htmlPath, "utf8");

// jsdom's DOMParser parses the real index.html the same way a browser would.
const doc = new DOMParser().parseFromString(html, "text/html");

describe("index.html locale drift", () => {
  test("the file actually contains translatable elements (guards the test itself)", () => {
    expect(doc.querySelectorAll("[data-i18n]").length).toBeGreaterThan(0);
    expect(
      doc.querySelectorAll("[data-i18n-placeholder]").length
    ).toBeGreaterThan(0);
  });

  test("every [data-i18n] element's text matches the en locale", () => {
    for (const el of doc.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n");
      const translation = t(key);
      // A missing key would resolve to the key itself and also fail below,
      // but fail loudly here with a clearer message.
      expect(
        translation,
        `key "${key}" is missing from the en locale files`
      ).not.toBe(key);
      expect(
        el.textContent?.trim(),
        `static text for [data-i18n="${key}"] drifted from the en locale`
      ).toBe(translation);
    }
  });

  test("every [data-i18n-placeholder] element's placeholder matches the en locale", () => {
    for (const el of doc.querySelectorAll("[data-i18n-placeholder]")) {
      const key = el.getAttribute("data-i18n-placeholder");
      const translation = t(key);
      expect(
        translation,
        `key "${key}" is missing from the en locale files`
      ).not.toBe(key);
      expect(
        el.getAttribute("placeholder"),
        `static placeholder for [data-i18n-placeholder="${key}"] drifted from the en locale`
      ).toBe(translation);
    }
  });
});
