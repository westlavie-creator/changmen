import antfu from "@antfu/eslint-config";

export default antfu({
  vue: true,
  typescript: true,

  stylistic: {
    semi: true,
    quotes: "double",
  },

  ignores: [
    "node_modules",
    "**/dist/**",
    "**/storage/**",
    "client/web/src/modules/**",
    "chrome-extension/lib/**",
  ],

  rules: {
    "vue/no-mutating-props": "error",
    "style/max-statements-per-line": "off",
    "no-console": "warn",
    "no-alert": "warn",
    "ts/method-signature-style": "off",
    "no-new": "off",
    "ts/no-use-before-define": "off",
    "jsdoc/check-param-names": "warn",
    "jsdoc/require-property-description": "off",
    "jsdoc/require-returns-description": "off",
    "node/prefer-global/process": "off",
    "node/prefer-global/buffer": "off",
    "no-restricted-imports": ["error", {
      paths: [{
        name: "node:test",
        message: "Use 'vitest' instead of 'node:test'.",
      }],
    }],
  },
}, {
  files: ["**/*.vue"],
  rules: {
    "prefer-const": "off",
  },
});
