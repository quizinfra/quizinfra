// Unit tests for the build-time indexed-locales transform
// (build/i18n-indexed.js): locale trees -> flat positional arrays, with
// every t("a.b") call site and data-i18n attribute rewritten to an index.

import { describe, expect, test } from "vitest";
import {
  collectLeafPaths,
  buildFlatRegistry,
  indexedifyLocalesChunk,
  rewriteArtifactHtml,
  createIndexedLocalesPlugins,
} from "../../build/i18n-indexed.js";

import enUi from "../../src/i18n/locales/en/ui.json";
import enDocs from "../../src/i18n/locales/en/docs.json";
import esUi from "../../src/i18n/locales/es/ui.json";
import esDocs from "../../src/i18n/locales/es/docs.json";
import frUi from "../../src/i18n/locales/fr/ui.json";
import frDocs from "../../src/i18n/locales/fr/docs.json";

// The registry exactly as src/i18n/index.js assembles it.
const realRegistry = {
  en: { ui: enUi, docs: enDocs },
  es: { ui: esUi, docs: esDocs },
  fr: { ui: frUi, docs: frDocs },
};

describe("buildFlatRegistry (real locale files)", () => {
  const { keyOrder, keyMap, flatLocales } = buildFlatRegistry(realRegistry);

  test("indexes every ui and docs leaf in source order", () => {
    expect(keyOrder[0]).toEqual({ namespace: "ui", path: "app.title" });
    // Every leaf of every locale file has a slot.
    const paths = new Set(keyOrder.map((slot: { path: string }) => slot.path));
    for (const [tree, namespace] of [
      [enUi, "ui"],
      [enDocs, "docs"],
    ] as const) {
      for (const path of collectLeafPaths(tree)) {
        expect(paths.has(path), `${namespace}.${path} missing`).toBe(true);
      }
    }
  });

  test("flat arrays are positionally aligned across locales", () => {
    expect(Object.keys(flatLocales)).toEqual(["en", "es", "fr"]);
    expect(flatLocales.es.length).toBe(keyOrder.length);
    expect(flatLocales.fr.length).toBe(keyOrder.length);

    // Spot-check the same index resolves in every locale, including a
    // dotted (nested) key and a docs-only key.
    for (const [path, expected] of [
      ["app.title", ["Multiple Choice Printable Quiz Maker", "Creador de exámenes imprimibles de opción múltiple", "Créateur de quiz imprimibles à choix multiples"]],
      ["question.text_label", ["Question Text", "Texto de la pregunta", "Texte de la question"]],
      ["labels.teacher", ["Teacher:", "Docente:", "Enseignant:"]],
    ] as const) {
      const index = keyMap[path as string];
      expect(typeof index).toBe("number");
      expect(flatLocales.en[index]).toBe(expected[0]);
      expect(flatLocales.es[index]).toBe(expected[1]);
      expect(flatLocales.fr[index]).toBe(expected[2]);
    }

    // The es/fr arrays must be exactly the locale files flattened into
    // the reference (en) order — the same data the runtime resolves.
    const expectedFlat = (ui: unknown, docs: unknown) =>
      keyOrder.map((slot: { namespace: string; path: string }) =>
        slot.path
          .split(".")
          .reduce(
            (node: any, part: string) => (node == null ? undefined : node[part]),
            slot.namespace === "ui" ? ui : docs
          )
      );
    expect(flatLocales.en).toEqual(expectedFlat(enUi, enDocs));
    expect(flatLocales.es).toEqual(expectedFlat(esUi, esDocs));
    expect(flatLocales.fr).toEqual(expectedFlat(frUi, frDocs));
  });

  test("ui-before-docs precedence: first occurrence wins in keyMap", () => {
    // The key map uses bare leaf paths; with no collisions between ui and
    // docs today, every ui key must map to its ui slot.
    for (const path of collectLeafPaths(enUi)) {
      const index = keyMap[path];
      expect(
        keyOrder[index].path === path && keyOrder[index].namespace === "ui",
        `keyMap["${path}"] should point at the ui namespace`
      ).toBe(true);
    }
    // Mirror the runtime's ui-before-docs precedence if a collision is
    // ever introduced: a duplicated leaf path maps to the ui occurrence.
    const collided = buildFlatRegistry({
      en: { ui: { dup: "from-ui" }, docs: { dup: "from-docs" } },
    });
    expect(collided.keyMap.dup).toBe(0);
    expect(collided.flatLocales.en).toEqual(["from-ui", "from-docs"]);
  });

  test("is deterministic", () => {
    expect(JSON.stringify(buildFlatRegistry(realRegistry))).toBe(
      JSON.stringify({ keyOrder, keyMap, flatLocales })
    );
  });

  test("hard-fails on parity drift (missing leaf, extra leaf, missing namespace)", () => {
    const clone = () => structuredClone(realRegistry);

    const missing = clone();
    delete (missing.es as any).ui.form.quiz_title;
    expect(() => buildFlatRegistry(missing)).toThrowError(
      /parity failure in locale "es".*missing \[form\.quiz_title\]/s
    );

    const extra = clone();
    (extra.fr as any).docs.labels.oops = "oops";
    expect(() => buildFlatRegistry(extra)).toThrowError(
      /parity failure in locale "fr".*unexpected \[labels\.oops\]/s
    );

    const missingNamespace = clone();
    delete (missingNamespace.es as any).docs;
    expect(() => buildFlatRegistry(missingNamespace)).toThrowError(
      /locale "es" has namespaces \[ui\]/
    );
  });

  test("hard-fails on non-string leaves", () => {
    for (const bad of [3, ["a"], null] as const) {
      const broken = structuredClone(realRegistry);
      (broken.es as any).ui.app.title = bad;
      expect(() => buildFlatRegistry(broken)).toThrowError(
        /must contain only strings and objects/
      );
    }
  });
});

// A synthetic chunk that mirrors how the real bundle nests everything in an
// IIFE, including a dual-mode t() that EXACTLY matches src/i18n/index.js
// (array-first indexed lookups, then dot-path walks over ui/docs, falling
// back to en, then to the key itself). If these helpers ever diverge from
// the runtime, the before/after equivalence test below stops meaning
// anything — keep them in sync.
const RUNTIME_HELPERS = `
  function lookupKey(tree, key) {
    let node = tree;
    for (const part of String(key).split(".")) {
      if (node == null || typeof node !== "object") return undefined;
      node = node[part];
    }
    return typeof node === "string" ? node : undefined;
  }
  function lookupIndexed(entry, key) {
    if (!Array.isArray(entry)) return undefined;
    const value = entry[key];
    return typeof value === "string" ? value : undefined;
  }
  function t(key) {
    const active = locales[activeLocale];
    const fallback = locales["en"];
    return (
      lookupIndexed(active, key) ??
      lookupKey(active?.ui, key) ??
      lookupKey(active?.docs, key) ??
      lookupIndexed(fallback, key) ??
      lookupKey(fallback.ui, key) ??
      lookupKey(fallback.docs, key) ??
      key
    );
  }
`;

function syntheticChunk(registry: unknown): string {
  // activeLocale is an IIFE-level binding reassigned by the loop, exactly
  // like the module-level `let activeLocale` in src/i18n/index.js (a loop
  // variable would be invisible to t()'s lexical scope).
  return `(function () {
  var locales = ${JSON.stringify(registry)};
  ${RUNTIME_HELPERS}
  var out = [];
  var activeLocale = "en";
  for (const code of ["en", "es", "fr"]) {
    activeLocale = code;
    out.push([t("greet"), t("nested.deep"), t("tip"), \`\${t("greet")}!\`]);
  }
  return out;
})()`;
}

const syntheticRegistry = {
  en: { ui: { greet: "hello", nested: { deep: "yes" } }, docs: { tip: "hint" } },
  es: { ui: { greet: "hola", nested: { deep: "sí" } }, docs: { tip: "pista" } },
  fr: { ui: { greet: "bonjour", nested: { deep: "oui" } }, docs: { tip: "indice" } },
};

describe("indexedifyLocalesChunk (synthetic chunk)", () => {
  test("rewrites the registry and every call site; behavior is unchanged", () => {
    const before = syntheticChunk(syntheticRegistry);
    const { code, keyMap, flatLocales } = indexedifyLocalesChunk(before);

    // Positional indices, ui leaves before docs leaves.
    expect(keyMap).toEqual({ greet: 0, "nested.deep": 1, tip: 2 });
    expect(flatLocales).toEqual({
      en: ["hello", "yes", "hint"],
      es: ["hola", "sí", "pista"],
      fr: ["bonjour", "oui", "indice"],
    });

    // Literal call sites became numbers (including inside the template
    // literal expression). Exact-string negatives rather than a /t\(\s*"/
    // regex, which would false-positive on innocent code like split(".").
    expect(code).toContain('t(0)');
    expect(code).toContain('t(1)');
    expect(code).toContain('t(2)');
    expect(code).not.toContain('t("greet")');
    expect(code).not.toContain('t("nested.deep")');
    expect(code).not.toContain('t("tip")');

    // The whole point: executing before and after produces identical
    // output for every locale, including the nested docs path and the
    // template-literal call.
    const runBefore = new Function(`return ${before}`)();
    const runAfter = new Function(`return ${code}`)();
    expect(runAfter).toEqual(runBefore);
    expect(runBefore).toEqual([
      ["hello", "yes", "hint", "hello!"],
      ["hola", "sí", "pista", "hola!"],
      ["bonjour", "oui", "indice", "bonjour!"],
    ]);
  });

  test("a missing key in an active locale falls back to en (indexed mode)", () => {
    // Runtime-level guard for lookupIndexed semantics used above.
    const locales: Record<string, string[]> = { en: ["shared"], es: [] };
    const indexed = (locale: string, key: string | number) => {
      const entry = locales[locale];
      const hit = Array.isArray(entry) ? entry[key as number] : undefined;
      return typeof hit === "string" ? hit : locales.en[key as number];
    };
    expect(indexed("es", 0)).toBe("shared");
    // Numeric strings (as carried by data-i18n attributes) work too.
    expect(indexed("en", "0")).toBe("shared");
  });

  test("refuses t() keys absent from the locale files (names them)", () => {
    const chunk = `(function () {
  var locales = {"en":{"ui":{"greet":"hello"},"docs":{}},"es":{"ui":{"greet":"hola"},"docs":{}},"fr":{"ui":{"greet":"bonjour"},"docs":{}}};
  ${RUNTIME_HELPERS}
  return t("nope.does_not_exist");
})()`;
    expect(() => indexedifyLocalesChunk(chunk)).toThrowError(
      /t\(\) called with key\(s\) absent from the locale files: \[nope\.does_not_exist\]/
    );
  });

  test("requires exactly one locales object literal", () => {
    const two = `(function () {
  (function () { var locales = {"en":{"ui":{}}}; return locales; })();
  (function () { var locales = {"en":{"ui":{}}}; return locales; })();
})()`;
    // Two declarators in separate scopes must still count as ambiguous.
    expect(() => indexedifyLocalesChunk(two)).toThrowError(/found 2/);

    const none = `(function () { return 1; })()`;
    expect(() => indexedifyLocalesChunk(none)).toThrowError(/found 0/);
  });

  test("rejects non-literal registry shapes", () => {
    const bad = `(function () {
  var locales = {"en":{"ui":{"greet": 3}}};
})()`;
    expect(() => indexedifyLocalesChunk(bad)).toThrowError(
      /locales\.en\.ui\.greet.*found Literal 3/s
    );
  });
});

describe("rewriteArtifactHtml", () => {
  const { keyMap } = buildFlatRegistry(syntheticRegistry as any);

  test("rewrites attribute values in markup only", () => {
    const html = `<!doctype html><html><body>
  <h1 data-i18n="greet">hello</h1>
  <input data-i18n-placeholder="greet" placeholder="hello">
  <p data-i18n="nested.deep">yes</p>
  <script>
    var selector = '[data-i18n="greet"]';
    document.querySelectorAll("[data-i18n]");
    var spoof = ' data-i18n="tip"';
  </script>
</body></html>`;
    const out = rewriteArtifactHtml(html, keyMap);

    expect(out).toContain('data-i18n="0"');
    expect(out).toContain('data-i18n-placeholder="0"');
    expect(out).toContain('data-i18n="1"');
    // Inside the script, everything is provably untouched.
    expect(out).toContain(`var selector = '[data-i18n="greet"]'`);
    expect(out).toContain(`var spoof = ' data-i18n="tip"'`);
    expect(out).toContain(`querySelectorAll("[data-i18n]")`);
  });

  test("hard-fails on unmapped attribute keys (would render blank forever)", () => {
    expect(() =>
      rewriteArtifactHtml('<h1 data-i18n="no.such.key">x</h1>', keyMap)
    ).toThrowError(/data-i18n="no\.such\.key"/);
  });

  test("refuses to run without the chunk pass", () => {
    expect(() => rewriteArtifactHtml("<h1>x</h1>", undefined)).toThrowError(
      /HTML pass ran before the chunk pass/
    );
  });
});

describe("createIndexedLocalesPlugins", () => {
  test("returns the chunk+html plugin pair wired to share the key map", async () => {
    const [indexedChunk, indexedHtml] = createIndexedLocalesPlugins();
    expect(indexedChunk.name).toBe("indexed-locales-chunk");
    expect(indexedHtml.name).toBe("indexed-locales-html");

    // Drive both generateBundle hooks the way Vite would.
    const chunk = { type: "chunk", fileName: "index.js", code: syntheticChunk(syntheticRegistry) };
    await (indexedChunk.generateBundle as any).handler({}, { "index.js": chunk });
    expect(chunk.code).not.toContain('t("greet")');
    expect(chunk.code).toContain('t(0)');

    const asset = { type: "asset", fileName: "index.html", source: '<h1 data-i18n="greet">hello</h1>' };
    await (indexedHtml.generateBundle as any).handler({}, { "index.html": asset });
    expect(asset.source).toBe('<h1 data-i18n="0">hello</h1>');
  });
});
