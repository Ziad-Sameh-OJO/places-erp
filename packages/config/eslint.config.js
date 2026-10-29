// Shared lint rules. The import rules enforce the layering described in ARCHITECTURE.md.
import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.strict, {
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "off",
    // with noUncheckedIndexedAccess, `x[i]!` after a bounds check is the honest way to say "this exists"
    "@typescript-eslint/no-non-null-assertion": "off",
    // NestJS modules are empty classes carrying a decorator; that's the framework's pattern
    "@typescript-eslint/no-extraneous-class": "off",
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@prisma/client"], message: "Use @places/db from the API/worker only." },
        { group: ["**/apps/*"], message: "Packages must never import from apps." },
      ],
    }],
  },
});
