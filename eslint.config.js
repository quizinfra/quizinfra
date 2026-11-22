import js from "@eslint/js";

export default [
  // Ignore TypeScript files – they are compiled and tested separately.
  { ignores: ["**/*.ts"] },
  js.configs.recommended,
  {
    files: ["**/*.js"], // lint only JavaScript files (browser and worker code)
    languageOptions: {
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        alert: "readonly",
        fetch: "readonly",
        Headers: "readonly",
        Response: "readonly",
        Blob: "readonly",
        URLSearchParams: "readonly",
        FileReader: "readonly",
        MutationObserver: "readonly",
        URL: "readonly",
        console: "readonly",
        addEventListener: "readonly"
      }
    },
    rules: {}
  }
];
