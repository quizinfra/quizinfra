// src/i18n/index.js
// Minimal frameworkless i18n runtime: locale registry, t(), and wiring
// between detection (detect.js) and the DOM. Keys are dot-paths resolved
// across all namespaces of the active locale, then the fallback locale,
// then the key itself (visible keys beat blank strings).

import { detectLanguage } from "./detect.js";
import enUi from "./locales/en/ui.json";
import enDocs from "./locales/en/docs.json";
import esUi from "./locales/es/ui.json";
import esDocs from "./locales/es/docs.json";
import frUi from "./locales/fr/ui.json";
import frDocs from "./locales/fr/docs.json";

/** Registry: locale code -> namespace -> nested message tree. */
const locales = {
  en: { ui: enUi, docs: enDocs },
  es: { ui: esUi, docs: esDocs },
  fr: { ui: frUi, docs: frDocs },
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
