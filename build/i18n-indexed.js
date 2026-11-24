// build/i18n-indexed.js
// Build-time transform: fully index the i18n payload. Each locale's
// nested message tree is replaced by ONE flat string array; every leaf
// key gets a positional index (assigned in the reference locale's
// source order); and every lookup site is rewritten from the key string
// to its index:
//
//   t("toast.saved")        ->  t(38)
//   data-i18n="form.date"   ->  data-i18n="13"
//
// Key names then exist nowhere in the artifact at all — not in the
// payload, not at the call sites. This is strictly row-major: per-locale
// arrays are positionally aligned, which is the only alignment the
// runtime ever needs (no cross-locale key-name bookkeeping, unlike the
// column-major experiment on branch column_major_localization_poc).
//
// Contract with src/i18n/index.js: t() first tries array indexing
// (indexed mode, artifacts) and falls back to dot-path walking (nested
// mode, src/dev/tests), so both worlds share one runtime.
//
// Hard build failures (never silent):
// - locale parity: every locale must expose the same leaf-path set as
//   the first locale;
// - leaves must be strings or nested objects (arrays/numbers/null are
//   ambiguous against positional indexing);
// - a t("key") literal call whose key maps nowhere;
// - a data-i18n attribute in the HTML whose value maps nowhere;
// - the spliced chunk must re-parse, must carry the exact expected
//   arrays, and must contain zero remaining t("<string>") calls.

import { parse } from "acorn";

// Same segmentation as stripArtifactComments: inline script/style bodies
// are never touched by HTML attribute rewriting (a data-i18n="..." string
// that ever appeared in JS code would otherwise be corrupted).
const CODE_SEGMENT =
  /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)|(<style>)([\s\S]*?)(<\/style>)/g;

const I18N_ATTR = /\s(data-i18n(?:-placeholder)?)="([^"]*)"/g;

// The entry chunk must contain exactly one `var|let|const locales = {...}`
// object literal (the registry built by src/i18n/index.js from the JSON
// imports). Rollup deconflicts names chunk-wide while minify is off, so
// matching the t() lookup helper by the bare name `t` is unambiguous.
const REGISTRY_IDENTIFIER = "locales";
const T_IDENTIFIER = "t";

/** hasOwnProperty-safe lookup on a plain-object key map. */
function mapGet(keyMap, key) {
  return Object.prototype.hasOwnProperty.call(keyMap, key) ? keyMap[key] : undefined;
}

/** Dot-paths of all string leaves; throws on unsupported leaf shapes. */
export function collectLeafPaths(tree, prefix = "") {
  if (typeof tree === "string") return [prefix];
  if (tree !== null && typeof tree === "object" && !Array.isArray(tree)) {
    return Object.entries(tree).flatMap(([key, child]) =>
      collectLeafPaths(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  const found = Array.isArray(tree) ? "array" : tree === null ? "null" : typeof tree;
  throw new Error(
    `indexed-locales: locale tree at "${prefix || "(root)"}" must contain only strings and objects (found ${found})`
  );
}

/**
 * Flatten { locale: tree } into:
 * - keyOrder: ["dot.path", ...] for every leaf, in the first locale's
 *   source order (leaves in object order);
 * - keyMap: { "dot.path" -> index }, the same paths used by t() call
 *   sites and data-i18n attributes;
 * - flatLocales: { locale: [string, ...] } positionally aligned.
 */
export function buildFlatRegistry(registry) {
  const localeOrder = Object.keys(registry);
  if (localeOrder.length === 0) {
    throw new Error("indexed-locales: locales registry is empty");
  }
  const reference = registry[localeOrder[0]];
  const keyOrder = collectLeafPaths(reference);
  if (keyOrder.length === 0) {
    throw new Error("indexed-locales: reference locale has no leaves");
  }

  // Parity: every locale must carry exactly the reference's leaf paths
  // (reported both directions for actionable failures).
  const expected = [...keyOrder].sort();
  for (const code of localeOrder.slice(1)) {
    const actual = [...collectLeafPaths(registry[code])].sort();
    const missing = expected.filter((path) => !actual.includes(path));
    const extra = actual.filter((path) => !expected.includes(path));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `indexed-locales: parity failure in locale "${code}": ` +
          `missing [${missing.join(", ")}] unexpected [${extra.join(", ")}]`
      );
    }
  }

  const keyMap = {};
  keyOrder.forEach((path, index) => {
    if (mapGet(keyMap, path) === undefined) keyMap[path] = index;
  });

  const flatLocales = {};
  for (const code of localeOrder) {
    flatLocales[code] = keyOrder.map((path) => {
      let node = registry[code];
      for (const part of path.split(".")) {
        node = node == null ? undefined : node[part];
      }
      if (typeof node !== "string") {
        // Unreachable after the parity pass; guards against refactors.
        throw new Error(`indexed-locales: leaf "${path}" is not a string`);
      }
      return node;
    });
  }
  return { keyOrder, keyMap, flatLocales };
}

/** ObjectExpression/string-literal AST -> plain JS value; strict about shapes. */
function objectTreeFromAst(node, where) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "ObjectExpression") {
    const tree = {};
    for (const property of node.properties) {
      if (property.type !== "Property" || property.computed) {
        throw new Error(`indexed-locales: ${where}: only plain string keys are supported`);
      }
      let key;
      if (property.key.type === "Identifier") key = property.key.name;
      else if (property.key.type === "Literal" && typeof property.key.value === "string")
        key = property.key.value;
      else
        throw new Error(
          `indexed-locales: ${where}: unsupported key node ${property.key.type}`
        );
      tree[key] = objectTreeFromAst(property.value, `${where}.${key}`);
    }
    return tree;
  }
  throw new Error(
    `indexed-locales: ${where}: locale trees must contain only strings and objects ` +
      `(found ${node.type}${node.type === "Literal" ? ` ${JSON.stringify(node.value)}` : ""}); ` +
      `indexed leaves are positional, so other shapes cannot be represented unambiguously`
  );
}

/** { locale: [string literal, ...] } AST -> plain JS value; verification only. */
function stringArraysFromAst(node, where) {
  if (node.type !== "ObjectExpression") {
    throw new Error(`indexed-locales: verification: ${where} is not an object literal`);
  }
  const out = {};
  for (const property of node.properties) {
    if (property.type !== "Property" || property.computed) {
      throw new Error(`indexed-locales: verification: ${where}: unexpected property`);
    }
    const key =
      property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal" && typeof property.key.value === "string"
          ? property.key.value
          : null;
    if (key === null) {
      throw new Error(`indexed-locales: verification: ${where}: unsupported key node`);
    }
    if (property.value.type !== "ArrayExpression") {
      throw new Error(
        `indexed-locales: verification: ${where}.${key} is not an array literal`
      );
    }
    out[key] = property.value.elements.map((element) => {
      if (element == null || element.type !== "Literal" || typeof element.value !== "string") {
        throw new Error(
          `indexed-locales: verification: ${where}.${key}: non-string array element`
        );
      }
      return element.value;
    });
  }
  return out;
}

/**
 * Locate the registry declarator anywhere in the AST (the chunk wraps its
 * statements in the IIFE, so it never sits at ast.body top level).
 * Returns { declarator, statement } pairs.
 */
function findRegistryDeclarator(ast) {
  const matches = [];
  const visit = (node, statement) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, statement);
      return;
    }
    if (typeof node.type !== "string") return;
    if (
      node.type === "VariableDeclarator" &&
      node.id?.type === "Identifier" &&
      node.id.name === REGISTRY_IDENTIFIER &&
      node.init?.type === "ObjectExpression" &&
      statement != null
    ) {
      matches.push({ declarator: node, statement });
    }
    const childStatement = node.type === "VariableDeclaration" ? node : statement;
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      visit(node[key], childStatement);
    }
  };
  visit(ast, null);
  return matches;
}

/** Every `t("<string>")` call, including inside template expressions. */
function findKeyedCalls(ast) {
  const calls = [];
  const visit = (node) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.type !== "string") return;
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === T_IDENTIFIER &&
      node.arguments.length >= 1 &&
      node.arguments[0].type === "Literal" &&
      typeof node.arguments[0].value === "string"
    ) {
      const arg = node.arguments[0];
      calls.push({ start: arg.start, end: arg.end, key: arg.value });
    }
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end") continue;
      visit(node[key]);
    }
  };
  visit(ast);
  return calls;
}

/**
 * Serialize { locale: [strings] } with one value per line, matching the
 * artifact's unminified style (git diffs on a key addition then touch a
 * handful of array lines instead of the whole payload).
 */
function stringifyFlatLocales(flatLocales, indent) {
  const entries = Object.entries(flatLocales).map(([code, values]) => {
    const lines = values.map((value) => `${indent}\t\t${JSON.stringify(value)}`);
    return `${indent}\t${JSON.stringify(code)}: [\n${lines.join(",\n")}\n${indent}\t]`;
  });
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

function applySplices(code, splices) {
  // Back-to-front so earlier offsets stay valid; refuse overlaps.
  const ordered = [...splices].sort((a, b) => b.start - a.start);
  let out = code;
  let cursor = Infinity;
  for (const splice of ordered) {
    if (splice.end > cursor) {
      throw new Error(`indexed-locales: overlapping splices at offset ${splice.start}`);
    }
    out = out.slice(0, splice.start) + splice.replacement + out.slice(splice.end);
    cursor = splice.start;
  }
  return out;
}

/**
 * Rewrite one Rollup chunk: the locales literal becomes the flat per-locale
 * arrays and every t("<key>") becomes t(<index>). Fully verified before
 * returning (re-parse, payload re-extraction, zero string-keyed t() calls),
 * so a corrupted splice fails the build instead of shipping.
 */
export function indexedifyLocalesChunk(code) {
  const ast = parse(code, { ecmaVersion: "latest" });
  const matches = findRegistryDeclarator(ast);
  if (matches.length !== 1) {
    throw new Error(
      `indexed-locales: expected exactly one \`var ${REGISTRY_IDENTIFIER} = ...\` object ` +
        `literal in the chunk (found ${matches.length}). If the registry in ` +
        `src/i18n/index.js was renamed, update REGISTRY_IDENTIFIER in build/i18n-indexed.js.`
    );
  }
  const { declarator, statement } = matches[0];
  const registry = objectTreeFromAst(declarator.init, REGISTRY_IDENTIFIER);
  const { keyOrder, keyMap, flatLocales } = buildFlatRegistry(registry);

  const calls = findKeyedCalls(ast);
  const unmapped = [
    ...new Set(calls.map((call) => call.key).filter((key) => mapGet(keyMap, key) === undefined)),
  ];
  if (unmapped.length > 0) {
    throw new Error(
      `indexed-locales: t() called with key(s) absent from the locale files: ` +
        `[${unmapped.join(", ")}]. In indexed mode a wrong key fails silently ` +
        `forever, so it is a build failure here.`
    );
  }

  // Injected lines match the indentation the chunk uses at the splice point.
  const lineStart = code.lastIndexOf("\n", statement.start) + 1;
  const indent = code.slice(lineStart, statement.start);
  const splices = [
    {
      start: declarator.init.start,
      end: declarator.init.end,
      replacement: stringifyFlatLocales(flatLocales, indent),
    },
    ...calls.map((call) => ({
      start: call.start,
      end: call.end,
      replacement: String(mapGet(keyMap, call.key)),
    })),
  ];
  const out = applySplices(code, splices);

  // Verification pass: the output must parse, the arrays must match what
  // buildFlatRegistry produced, and no string-keyed t() call may remain.
  const verifyAst = parse(out, { ecmaVersion: "latest" });
  const after = findRegistryDeclarator(verifyAst);
  if (after.length !== 1) {
    throw new Error(
      `indexed-locales: verification found ${after.length} locales literals after splicing`
    );
  }
  const reextracted = stringArraysFromAst(after[0].declarator.init, REGISTRY_IDENTIFIER);
  if (JSON.stringify(reextracted) !== JSON.stringify(flatLocales)) {
    throw new Error("indexed-locales: spliced payload does not match the expected arrays");
  }
  const leftovers = findKeyedCalls(verifyAst);
  if (leftovers.length > 0) {
    throw new Error(
      `indexed-locales: string-keyed t() calls survived: [${leftovers
        .map((call) => call.key)
        .join(", ")}]`
    );
  }
  return { code: out, keyOrder, keyMap, flatLocales };
}

/**
 * Rewrite data-i18n / data-i18n-placeholder attribute values to their
 * indices. Operates only on HTML text segments (never inside inline
 * script/style bodies), so selectors like querySelectorAll("[data-i18n]")
 * and any attribute-looking string in JS code are provably untouched.
 */
export function rewriteArtifactHtml(html, keyMap) {
  if (!keyMap) {
    throw new Error(
      "indexed-locales: HTML pass ran before the chunk pass produced a key map"
    );
  }
  let out = "";
  let last = 0;
  let match;
  CODE_SEGMENT.lastIndex = 0;
  while ((match = CODE_SEGMENT.exec(html))) {
    out += indexSegment(html.slice(last, match.index), keyMap);
    out += match[0];
    last = match.index + match[0].length;
  }
  out += indexSegment(html.slice(last), keyMap);
  return out;
}

function indexSegment(text, keyMap) {
  return text.replace(I18N_ATTR, (whole, attribute, key) => {
    const index = mapGet(keyMap, key);
    if (index === undefined) {
      throw new Error(
        `indexed-locales: artifact HTML has ${attribute}="${key}" but the locale ` +
          `files contain no such key (an unmapped attribute would render blank forever)`
      );
    }
    return ` ${attribute}="${index}"`;
  });
}

/**
 * The two Vite plugins, sharing the key map the chunk pass produces.
 * Register the returned pair BEFORE classicInlineScript/stripArtifactComments:
 * the chunk pass runs at generateBundle@pre (before singlefile inlines the
 * JS) and the HTML pass at @post (after the final artifact text exists).
 */
export function createIndexedLocalesPlugins() {
  let compiled = null;
  const indexedChunk = {
    name: "indexed-locales-chunk",
    generateBundle: {
      order: "pre",
      handler(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== "chunk" || !chunk.fileName.endsWith(".js")) continue;
          const result = indexedifyLocalesChunk(chunk.code);
          chunk.code = result.code;
          compiled = result;
        }
      },
    },
  };
  const indexedHtml = {
    name: "indexed-locales-html",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        for (const [fileName, asset] of Object.entries(bundle)) {
          if (!fileName.endsWith(".html") || asset.type !== "asset") continue;
          asset.source = rewriteArtifactHtml(String(asset.source), compiled?.keyMap);
        }
      },
    },
  };
  return [indexedChunk, indexedHtml];
}
