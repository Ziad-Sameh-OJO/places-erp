// Shared lint rules. The import rules enforce the layering described in ARCHITECTURE.md.
import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.strict, {
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-floating-promises": "off",
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@prisma/client"], message: "Use @places/db from the API/worker only." },
        { group: ["**/apps/*"], message: "Packages must never import from apps." },
      ],
    }],
  },
});
