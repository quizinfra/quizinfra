// src/i18n/index.js
// Minimal frameworkless i18n runtime: locale registry, t(), and wiring
// between detection (detect.js) and the DOM. Keys are dot-paths resolved
// in the active locale's message tree, then the fallback locale's, then
// the key itself (visible keys beat blank strings).

import { detectLanguage } from "./detect.js";
import enLocale from "./locales/en.json";
import esLocale from "./locales/es.json";
import frLocale from "./locales/fr.json";

/** Registry: locale code -> nested message tree (one file per locale). */
const locales = {
  en: enLocale,
  es: esLocale,
  fr: frLocale,
};

export const SUPPORTED_LOCALES = Object.keys(locales);
export const FALLBACK_LOCALE = "en";
export const LANG_STORAGE_KEY = "lang";

// Compact, discreet option labels: an emblem per language plus its code
// (the bare code keeps the options readable for screen readers and text
//-only rendering). Deliberately NOT translated, so every user can
// recognise their own language regardless of the active locale.
export const LOCALE_LABELS = {
  en: "🌹 en",
  es: "🧉 es",
  fr: "⚜️ fr",
};

let activeLocale = FALLBACK_LOCALE;

function lookupKey(tree, key) {
  let node = tree;
  for (const part of String(key).split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Indexed mode (build artifacts only): the build may replace each locale's
 * nested message trees with ONE flat string array and rewrite every lookup
 * site to a positional index (build/i18n-indexed.js). entry[key] accepts
 * both numeric indices and the numeric strings carried by data-i18n
 * attributes. In src/dev/tests locales hold plain objects, so this always
 * returns undefined and lookupKey() decides.
 */
function lookupIndexed(entry, key) {
  if (!Array.isArray(entry)) return undefined;
  const value = entry[key];
  return typeof value === "string" ? value : undefined;
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
 * Translate a dot-path key (or an array index in indexed-mode artifacts).
 * Interpolates {{name}} params; params are HTML-escaped by default because
 * most templating in this app is innerHTML-based. Missing keys render as
 * the key itself.
 */
export function t(key, params) {
  const active = locales[activeLocale];
  const fallback = locales[FALLBACK_LOCALE];
  const template =
    lookupIndexed(active, key) ??
    lookupKey(active, key) ??
    lookupIndexed(fallback, key) ??
    lookupKey(fallback, key) ??
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

/**
 * Listeners that re-render dynamically built views. applyLanguage()
 * can only reach static markup (elements carrying data-i18n attributes);
 * runtime-rendered DOM (the question forms) has no such attributes — the
 * single-file build rewrites only static-HTML attributes and t("key")
 * literals to positional indices, so attributes added at runtime would
 * never be indexed and would render as raw key names. Those views
 * therefore re-render themselves through onLocaleChange() instead.
 */
const localeChangeListeners = new Set();

/**
 * Register `fn` to run after the user changes the locale via the
 * language switcher (once setLocale and applyLanguage are done).
 * Returns an unsubscribe function.
 */
export function onLocaleChange(fn) {
  localeChangeListeners.add(fn);
  return () => {
    localeChangeListeners.delete(fn);
  };
}

function notifyLocaleChange() {
  // Copy first so a listener may unsubscribe during iteration.
  for (const fn of [...localeChangeListeners]) fn(activeLocale);
}

/**
 * Mount a <select> language switcher into `container` (default:
 * #langSwitcher). Changing it activates the locale, persists the choice
 * to localStorage (so detection keeps it on next load) and re-applies
 * translations to the live DOM. Returns the created element, or null when
 * the container is absent (e.g. partial DOMs in component tests).
 */
export function mountLanguageSwitcher(container = document.getElementById("langSwitcher")) {
  if (!container) return null;

  const select = document.createElement("select");
  select.id = "langSwitcherSelect";
  select.setAttribute("aria-label", t("lang.label"));
  for (const code of SUPPORTED_LOCALES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = LOCALE_LABELS[code] ?? code;
    select.appendChild(option);
  }
  select.value = activeLocale;

  select.addEventListener("change", () => {
    if (!setLocale(select.value)) return;
    localStorage.setItem(LANG_STORAGE_KEY, activeLocale);
    applyLanguage();
    // Keep the accessible label in the language the user now sees.
    select.setAttribute("aria-label", t("lang.label"));
    // Let dynamically rendered views (questions) refresh themselves.
    notifyLocaleChange();
  });

  container.appendChild(select);
  return select;
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
