// eslint-config-next 15 ships legacy (.eslintrc) configs → load them via FlatCompat
// (the previous file used the Next 16 flat-config imports, which broke `next build` lint).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "tests/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // the codebase maps loosely-typed Supabase JSON in a few places
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
