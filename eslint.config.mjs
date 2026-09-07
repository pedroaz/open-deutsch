import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import openDeutsch from "./scripts/eslint-rules/open-deutsch.mjs";

const typeScriptFiles = ["**/*.{ts,tsx}"];
const rendererFiles = ["apps/desktop/src/renderer/**/*.{ts,tsx}"];
const electronFiles = ["apps/desktop/src/{main,preload}/**/*.{ts,tsx}"];

const scopedTypeScriptConfigs = tseslint.configs.strictTypeChecked.map((config) => ({
  ...config,
  files: typeScriptFiles,
}));

export default tseslint.config(
  {
    name: "open-deutsch/ignores",
    ignores: ["**/dist/**", "**/build/**", "**/out/**", "**/release/**", "node_modules/**"],
  },
  {
    ...js.configs.recommended,
    name: "open-deutsch/javascript",
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  ...scopedTypeScriptConfigs,
  {
    name: "open-deutsch/typescript",
    files: typeScriptFiles,
    plugins: {
      "import-x": importPlugin,
      "open-deutsch": openDeutsch,
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "apps/desktop/vite*.config.ts",
            "packages/codex-client/src/environment.d.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "import-x/first": "error",
      "import-x/newline-after-import": "error",
      "import-x/no-duplicates": "error",
      "open-deutsch/enforce-package-boundaries": "error",
    },
  },
  {
    name: "open-deutsch/renderer-react-accessibility",
    files: rendererFiles,
    plugins: {
      react,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "19.0" } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.flat["recommended-latest"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "open-deutsch/no-direct-react-aria-controls": "error",
    },
  },
  {
    name: "open-deutsch/electron-security",
    files: electronFiles,
    plugins: { "open-deutsch": openDeutsch },
    rules: {
      "open-deutsch/no-electron-remote": "error",
      "open-deutsch/secure-electron-preferences": "error",
    },
  },
  {
    ...prettier,
    name: "open-deutsch/prettier-compatibility",
  },
);
