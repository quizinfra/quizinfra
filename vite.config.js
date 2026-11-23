import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

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

export default defineConfig({
  plugins: [viteSingleFile(), classicInlineScript],
  build: {
    // The deployable artifact: one self-contained docs/index.html
    // (HTML + CSS + all JS inlined). Committed to the repository; CI
    // verifies that the checked-in copy matches a fresh build.
    outDir: 'docs',
    emptyOutDir: true,
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
