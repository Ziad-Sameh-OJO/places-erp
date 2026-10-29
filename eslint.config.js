// One lint for the whole repo, with the shared rules from packages/config (layering, no `any`).
import shared from "./packages/config/eslint.config.js";

export default [
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts", ".local/**", "**/*.js", "**/*.mjs", "**/*.cjs"] },
  ...shared,
  // the database package is the one place allowed to touch the Prisma client directly
  { files: ["packages/db/**"], rules: { "no-restricted-imports": "off" } },
];
