// src/i18n/index.js
// Minimal frameworkless i18n runtime: locale registry, t(), and wiring
// between detection (detect.js) and the DOM. Keys are dot-paths resolved
// across all namespaces of the active locale, then the fallback locale,
// then the key itself (visible keys beat blank strings).

import { detectLanguage } from "./detect.js";
import enUi from "./locales/en/ui.json";
import enDocs from "./locales/en/docs.json";

/** Registry: locale code -> namespace -> nested message tree. */
const locales = {
  en: { ui: enUi, docs: enDocs },
};

export const SUPPORTED_LOCALES = Object.keys(locales);
export const FALLBACK_LOCALE = "en";
export const LANG_STORAGE_KEY = "lang";

let activeLocale = FALLBACK_LOCALE;

function lookupKey(tree, key) {
  let node = tree;
  for (const part of String(key).split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Translate a dot-path key. Interpolates {{name}} params; params are
 * HTML-escaped by default because most templating in this app is
 * innerHTML-based. Missing keys render as the key itself.
 */
export function t(key, params) {
  const active = locales[activeLocale];
  const fallback = locales[FALLBACK_LOCALE];
  const template =
    lookupKey(active?.ui, key) ??
    lookupKey(active?.docs, key) ??
    lookupKey(fallback.ui, key) ??
    lookupKey(fallback.docs, key) ??
    key;
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? escapeHTML(params[name])
      : match
  );
}

/** Activate a supported locale. Returns false (and changes nothing) if unsupported. */
export function setLocale(lang) {
  if (!locales[lang]) return false;
  activeLocale = lang;
  return true;
}

export function getLocale() {
  return activeLocale;
}

/**
 * Apply the active locale to the DOM: every [data-i18n] element gets its
 * textContent translated, every [data-i18n-placeholder] gets its placeholder,
 * plus document.title and <html lang>.
 */
export function applyLanguage(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.getAttribute("data-i18n"));
  }
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  }
  document.title = t("app.title");
  document.documentElement.lang = activeLocale;
}

/**
 * Detect + activate + apply the language. `env` lets tests inject inputs:
 * { urlLang, stored, navigatorLanguages, root }.
 */
export function initI18n(env = {}) {
  const urlLang =
    env.urlLang ?? new URLSearchParams(window.location.search).get("lang");
  const stored =
    env.stored !== undefined
      ? env.stored
      : localStorage.getItem(LANG_STORAGE_KEY);
  const navigatorLanguages =
    env.navigatorLanguages ??
    navigator.languages ??
    (navigator.language ? [navigator.language] : []);
  const lang = detectLanguage({
    urlLang,
    stored,
    navigatorLanguages,
    supported: SUPPORTED_LOCALES,
    fallback: FALLBACK_LOCALE,
  });
  setLocale(lang);
  applyLanguage(env.root ?? document);
  return lang;
}
