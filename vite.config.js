import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { parse } from 'acorn';

// The singlefile plugin inlines the bundle but keeps `type="module"` on
// the <script> tag. Module scripts are deferred (re-introducing the
// untranslated-flash) and are blocked by CORS over file:// (breaking the
// download-and-run story). The bundle is built as an IIFE with no
// imports, so rewriting the tag to a classic script is safe.
const classicInlineScript = {
  name: 'classic-inline-script',
  enforce: 'post',
  // Must run in the same stage as (and after) the singlefile plugin,
  // which inlines the bundle in generateBundle@post; by then the
  // <script> tag has no src and holds the IIFE source.
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!fileName.endsWith('.html') || chunk.type !== 'asset') continue;
        let source = String(chunk.source);

        // 1) Rewrite the inlined module tag to a classic script.
        source = source.replace(/<script\b([^>]*)>/g, (match, attrs) => {
          if (!/\btype="module"/.test(match)) return match;
          if (/\bsrc=/.test(match)) return match; // never touch external refs
          const cleaned = attrs
            .replace(/\s*type="module"/, '')
            .replace(/\s*crossorigin(?:="[^"]*")?/, '')
            .trim();
          return cleaned ? `<script ${cleaned}>` : '<script>';
        });

        // 2) Relocate inline scripts to just before </body>. The singlefile
        // plugin hoists the script tag into <head>, where a synchronous
        // classic script would run before the app markup is parsed (and
        // find nothing to translate). The non-greedy match stops at the
        // first </script>, exactly like the browser's own parser.
        let bodyClose = source.lastIndexOf('</body>');
        if (bodyClose !== -1) {
          const inlineScripts =
            source.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) ?? [];
          const relocatable = inlineScripts.filter(
            (s) => source.indexOf(s) < bodyClose
          );
          if (relocatable.length) {
            for (const script of relocatable) source = source.replace(script, '');
            bodyClose = source.lastIndexOf('</body>');
            source =
              source.slice(0, bodyClose) +
              relocatable.join('\n  ') +
              '\n  ' +
              source.slice(bodyClose);
          }
        }

        chunk.source = source;
      }
    },
  },
};

// The artifact ships unminified for reviewability, but the hand-written
// comments (mostly JSDoc) cost ~14% of the gzipped wire size while being
// redundant with src/, where they are maintained. Strip them from the
// bundle — but keep Rollup's `// src/…` module banners, the cheapest
// navigational aid in a concatenated file. Parsing with acorn (rather
// than regexing) guarantees we only delete real comment tokens, never a
// `//` or `/*` that lives inside a string literal (the Word-document and
// data-URI string-building code is exactly the genre that grows such
// strings, e.g. `http://` namespaces).
const stripJsComments = (js) => {
  const comments = [];
  parse(js, { ecmaVersion: 'latest', onComment: comments });
  let out = '';
  let pos = 0;
  for (const comment of comments) {
    const text = js.slice(comment.start, comment.end);
    if (/^\/\/\s*src\//.test(text)) continue; // keep module map banners
    out += js.slice(pos, comment.start);
    pos = comment.end;
  }
  return out + js.slice(pos);
};

// One linear pass over the artifact: each inline-script segment is
// comment-stripped by acorn (never touching `//` or `/*` inside string
// literals), CSS block comments are removed only inside <style>, HTML
// comments only outside code segments — so a `<!--` or `/*` that ever
// appears in bundle string code is provably untouched.
const CODE_SEGMENT =
  /(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)|(<style>)([\s\S]*?)(<\/style>)/g;

const stripArtifactComments = {
  name: 'strip-artifact-comments',
  enforce: 'post',
  // Runs after classicInlineScript (registration order within the same
  // generateBundle@post stage) so it operates on the final artifact text.
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (!fileName.endsWith('.html') || chunk.type !== 'asset') continue;
        const source = String(chunk.source);
        let out = '';
        let last = 0;
        let match;
        CODE_SEGMENT.lastIndex = 0;
        while ((match = CODE_SEGMENT.exec(source))) {
          out += source.slice(last, match.index).replace(/<!--[\s\S]*?-->/g, '');
          if (match[2] !== undefined) {
            out += match[1] + stripJsComments(match[2]) + match[3];
          } else {
            out += match[4] + match[5].replace(/\/\*[\s\S]*?\*\//g, '') + match[6];
          }
          last = match.index + match[0].length;
        }
        out += source.slice(last).replace(/<!--[\s\S]*?-->/g, '');
        // Drop lines left blank by the removed comments.
        chunk.source = out
          .split('\n')
          .filter((line) => line.trim() !== '')
          .join('\n');
      }
    },
  },
};

export default defineConfig({
  plugins: [viteSingleFile(), classicInlineScript, stripArtifactComments],
  build: {
    // The deployable artifact: one self-contained docs/index.html
    // (HTML + CSS + all JS inlined). Committed to the repository; CI
    // verifies that the checked-in copy matches a fresh build.
    outDir: 'docs',
    emptyOutDir: true,
    // Deliberately unminified: the committed artifact is a reviewable,
    // auditable file (source comments, identifiers and line breaks are
    // preserved, so diffs stay surgical). The raw size grows ~46%
    // (≈19.5 KB -> ≈28.4 KB; gzip on the wire ≈5.5 KB -> ≈7.5 KB, which
    // GitHub Pages compresses for us). Do not re-enable minification.
    minify: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    // Inline as a classic script (no "type=module" defer semantics) so the
    // bundle executes synchronously during parsing: no untranslated-flash,
    // and the file works when opened over file:// as well.
    rollupOptions: {
      output: {
        format: 'iife',
      },
    },
  },
  // Base URL – keep '/' for a custom domain or when using a Cloudflare Worker.
  base: '/',
});
