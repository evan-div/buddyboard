import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // react-three-fiber scenes animate imperatively inside useFrame: they
    // mutate three.js objects held in refs/memos and hand refs to updater
    // components. The React Compiler purity rules flag that model wholesale,
    // so relax the two rules that misfire on it for the 3D world components.
    files: ["src/components/World/**"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
