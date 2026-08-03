import { singleshot } from "functools-kit";
import { parseArgs } from "util";

const ALLOWED_EXTENSIONS = [
  `.cjs`,
  `.mjs`,
  `.ts`,
  `.tsx`,
  `.js`,
  `.pine`,
];

const DISALLOWED_PATHS = [
  "node_modules",
  "@backtest-kit",
  "mcp/build/index.mjs",
  "mcp/build/index.js",
  "mcp\\build\\index.mjs",
  "mcp\\build\\index.js",
];

export const getArgs = singleshot(() => {
  const { values, positionals } = parseArgs({
    args: process.argv,
    options: {
      host: {
        type: "string",
        default: "",
      },
      port: {
        type: "string",
        default: "",
      }
    },
    strict: false,
    allowPositionals: true,
  });
  return {
    values,
    positionals,
  };
});

export const getPositionals = singleshot((): string[] => {
  const { positionals = [] } = getArgs();
  return positionals
    .filter((value) => !DISALLOWED_PATHS.some((path) => value.includes(path)))
    .filter((value) =>
      ALLOWED_EXTENSIONS.some((ext) => value.endsWith(ext)),
    );
});
