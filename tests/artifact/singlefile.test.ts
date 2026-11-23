// Smoke test for the committed deployable artifact (docs/index.html).
// CI additionally verifies the artifact equals a fresh `npm run build`;
// these assertions catch a structurally broken artifact (external refs,
// deferred module scripts, missing payloads) even before that.

import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ARTIFACT_PATH = join(process.cwd(), 'docs', 'index.html');
const html = existsSync(ARTIFACT_PATH) ? readFileSync(ARTIFACT_PATH, 'utf8') : null;

function parse(): Document {
  expect(html, 'docs/index.html is missing; run `npm run build`').not.toBeNull();
  return new DOMParser().parseFromString(html as string, 'text/html');
}

describe('single-file artifact (docs/index.html)', () => {
  test('exists', () => {
    expect(html, 'run `npm run build`').not.toBeNull();
  });

  test('all scripts are inline and execute synchronously', () => {
    const doc = parse();
    const scripts = Array.from(doc.querySelectorAll('script'));
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script.getAttribute('src'), 'no external scripts').toBeNull();
      // A module script is deferred: it would re-introduce the
      // untranslated-flash and break the file when opened over file://.
      expect(
        script.getAttribute('type'),
        'scripts must be classic (no type="module")'
      ).toBeNull();
      expect(script.textContent.length).toBeGreaterThan(1000);
    }
    // A synchronous classic script must come after the markup it
    // translates (guards the build's relocation step).
    expect(html.indexOf('<script')).toBeGreaterThan(
      html.indexOf('id="questionsContainer"')
    );
  });

  test('has no external resource references at all', () => {
    const doc = parse();
    expect(doc.querySelectorAll('link[href]').length).toBe(0);
    expect(doc.querySelectorAll('img[src]').length).toBe(0);
    expect(doc.querySelectorAll('iframe[src]').length).toBe(0);
    for (const el of Array.from(doc.querySelectorAll('[src], [href]'))) {
      const value = el.getAttribute('src') ?? el.getAttribute('href') ?? '';
      expect(value, `unexpected external reference: ${value}`).toMatch(
        /^(#:|#\w|data:)/
      );
    }
  });

  test('bundles the app markup and every locale payload', () => {
    const doc = parse();
    expect(doc.querySelectorAll('[data-i18n]').length).toBeGreaterThan(10);
    expect(doc.querySelector('noscript')).not.toBeNull();
    expect(doc.getElementById('questionsContainer')).not.toBeNull();
    expect(doc.getElementById('langSwitcher')).not.toBeNull();
    // All three locale trees are inlined into the single file.
    expect(html).toContain('🌹 en');
    expect(html).toContain('🧉 es');
    expect(html).toContain('⚜️ fr');
    expect(html).toContain('Creador de exámenes');
    expect(html).toContain('Créateur de quiz');
  });

  test('ships comment-stripped code with module banners preserved', () => {
    // The bundle is unminified for reviewability but hand-written
    // comments are stripped at build time (see stripArtifactComments
    // in vite.config.js); only Rollup's `// src/…` module map banners
    // and the artifact's own docs remain as comments.
    const doc = parse();
    const script = Array.from(doc.querySelectorAll('script')).find(
      (s) => !s.getAttribute('src')
    )!;
    const comments = Array.from(
      script.textContent!.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g)
    ).map((m) => m[0]);
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) {
      expect(comment, `unexpected comment survived the build: ${comment.slice(0, 40)}`).toMatch(
        /^\/\/ src\/[\w/]+\.js$/
      );
    }
    // Spot-check that representative source comments did NOT survive
    // (JSDoc, a CSS comment, and an HTML comment).
    expect(html).not.toContain('@typedef');
    expect(html).not.toContain('/* Layout */');
    expect(html).not.toContain('Modal for importing');
  });

  test('executes standalone: translates on load, honors ?lang=, switcher and inline handlers work', async () => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM(html as string, {
      runScripts: 'dangerously',
      url: 'http://localhost/?lang=es',
    });
    const { window } = dom;
    const doc = window.document;
    try {
      // The synchronous inline script translated everything during parsing.
      expect(doc.querySelector('h1')!.textContent).toBe(
        'Creador de exámenes imprimibles de opción múltiple'
      );
      expect(doc.documentElement.lang).toBe('es');
      expect(doc.title).toBe('Creador de exámenes imprimibles de opción múltiple');

      // The switcher works inside the built artifact.
      const select = doc.getElementById('langSwitcherSelect') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.value).toBe('es');
      select.value = 'fr';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(doc.querySelector('h1')!.textContent).toBe(
        'Créateur de quiz imprimibles à choix multiples'
      );
      expect(window.localStorage.getItem('lang')).toBe('fr');

      // Inline onclick handlers are served by the window-exposed bundle.
      doc.querySelector('button[onclick="addQuestion()"]')!.click();
      expect(doc.querySelectorAll('.question').length).toBe(1);
      // 'question.heading' is legitimately identical in en/fr, so assert
      // on the label, which is unambiguously French.
      expect(
        doc.querySelector('.question label')!.textContent
      ).toBe('Texte de la question');
    } finally {
      window.close();
    }
  });
});
