import { createRequire } from "node:module";

const frontendRequire = createRequire(new URL("../frontend/package.json", import.meta.url));
const js = frontendRequire("@eslint/js");
const globals = frontendRequire("globals");
const { defineConfig, globalIgnores } = frontendRequire("eslint/config");

export default defineConfig([
    globalIgnores(["node_modules"]),
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            ...js.configs.recommended.rules,
            "no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
                caughtErrorsIgnorePattern: "^_"
            }]
        }
    }
]);
