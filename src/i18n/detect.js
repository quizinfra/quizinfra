// src/i18n/detect.js
// Pure language-detection ladder, deliberately free of DOM/browser access
// so it can be unit-tested with injected inputs.
//
// Priority: explicit URL override -> saved preference -> browser languages
// (exact match, then region-stripped, e.g. "es-MX" -> "es") -> fallback.

/** Lowercase/trim a BCP 47 tag. Returns "" for non-strings. */
export function normalizeTag(tag) {
  return typeof tag === "string" ? tag.trim().toLowerCase() : "";
}

/**
 * Match a single tag against the list of supported locale codes.
 * Tries an exact match first, then strips the region subtag.
 * Returns the matched supported code or null.
 */
export function matchTag(tag, supported) {
  const normalized = normalizeTag(tag);
  if (!normalized) return null;
  return (
    supported.find(s => s.toLowerCase() === normalized) ??
    supported.find(s => s.toLowerCase() === normalized.split("-")[0]) ??
    null
  );
}

/**
 * Resolve the language to present.
 *
 * @param {Object} opts
 * @param {string} [opts.urlLang]              Value of a `?lang=` override.
 * @param {?string} [opts.stored]              Persisted user preference.
 * @param {string[]} [opts.navigatorLanguages] Browser languages, in Q order.
 * @param {string[]} opts.supported            Supported locale codes.
 * @param {string} opts.fallback               Locale used when nothing matches.
 * @returns {string} One of `supported`.
 */
export function detectLanguage({
  urlLang,
  stored,
  navigatorLanguages = [],
  supported,
  fallback,
}) {
  return (
    matchTag(urlLang, supported) ??
    matchTag(stored, supported) ??
    navigatorLanguages.map(tag => matchTag(tag, supported)).find(Boolean) ??
    matchTag(fallback, supported) ??
    supported[0]
  );
}
