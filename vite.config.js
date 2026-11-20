import { defineConfig } from 'vite';

export default defineConfig({
  // Build output goes to the folder that GitHub Pages reads.
  build: {
    outDir: 'docs', // <-- important for GH Pages
    emptyOutDir: true,
  },
  // Base URL – keep '/' for a custom domain or when using a Cloudflare Worker.
  base: '/',
});
