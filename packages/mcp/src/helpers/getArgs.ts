import { singleshot } from "functools-kit";
import { parseArgs } from "util";

const DEFAULT_SSE_PORT = 8080;

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
      },
      sse: {
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

/**
 * Resolves the `--sse [PORT]` argument into a port number, or null for stdio.
 *
 * `--sse` alone selects {@link DEFAULT_SSE_PORT}; `--sse 8080` overrides it.
 *
 * A non-numeric value is rejected rather than ignored. `parseArgs` in
 * non-strict mode treats the next token as the flag's value, so
 * `--sse ./strategy.ts` would otherwise consume the strategy path as the port
 * and start with no strategy loaded at all — a silent misconfiguration. Failing
 * loudly points at the fix: put the positional before the flag, or pass a port.
 *
 * @returns Port to serve SSE on, or null when the flag was not passed
 * @throws If `--sse` carries a value that is not a valid TCP port
 */
export const getSsePort = singleshot((): number | null => {
  const { values } = getArgs();
  const sse = values.sse;
  if (sse === undefined || sse === false || sse === "") {
    return null;
  }
  // Bare `--sse`: non-strict parseArgs yields `true` when no value follows
  if (sse === true) {
    return DEFAULT_SSE_PORT;
  }
  const port = Number(sse);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `MCP Error: --sse expects a TCP port, got "${String(sse)}". Pass "--sse" for the default ${DEFAULT_SSE_PORT}, or "--sse 8080". Note a positional path directly after --sse is read as its value: put the path first.`,
    );
  }
  return port;
});

export const getPositionals = singleshot((): string[] => {
  const { positionals = [] } = getArgs();
  return positionals
    .filter((value) => !DISALLOWED_PATHS.some((path) => value.includes(path)))
    .filter((value) =>
      ALLOWED_EXTENSIONS.some((ext) => value.endsWith(ext)),
    );
});
