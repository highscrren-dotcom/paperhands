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
      },
      tools: {
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

/**
 * Parses the comma-separated `--tools` argument into a tool name list.
 *
 * An empty or missing value yields an empty list, which the entry point
 * reads as "register every tool" — narrowing the surface is opt-in.
 *
 * @returns Tool names requested on the command line, trimmed and non-empty
 */
export const getToolList = singleshot((): string[] => {
  const { values } = getArgs();
  const toolList = typeof values.tools === "string" ? values.tools : "";
  return toolList
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
});

export const getPositionals = singleshot((): string[] => {
  const { positionals = [] } = getArgs();
  return positionals
    .filter((value) => !DISALLOWED_PATHS.some((path) => value.includes(path)))
    .filter((value) =>
      ALLOWED_EXTENSIONS.some((ext) => value.endsWith(ext)),
    );
});
