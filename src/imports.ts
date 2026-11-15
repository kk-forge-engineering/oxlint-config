// Reads from disk which modules a source file imports, for the checks that count imports across files. oxlint lints one
// file at a time, so those checks parse the other files themselves.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseSync } from "oxc-parser";

import { testFile } from "./places.js";

/** Matches the extension of a JavaScript or TypeScript source file, a `.d.ts` file included. */
export const sourceFile = /\.[cm]?[jt]sx?$/;

/**
 * Matches a string literal, or a template literal without a placeholder, that names a dynamic
 * import's module. The checks count no other dynamic import.
 */
const literal = /^(["'`])([^"'`$]*)\1$/;

/**
 * Returns the source files under a folder, less tests, `node_modules` and dot folders, or none when
 * the folder is missing.
 */
export function sourceFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : sourceFiles(path);
    }
    // The checks skip a test file. A test follows its code, so it uses no module on the code's behalf.
    return entry.isFile() && sourceFile.test(entry.name) && !testFile.test(entry.name)
      ? [path]
      : [];
  });
}

interface Specifiers {
  mtimeMs: number;
  size: number;
  specifiers: string[];
}

/**
 * Holds the specifiers of each file read so far. A long-lived oxlint, such as the language server, reads a file again
 * only once its time or size changes.
 */
const read = new Map<string, Specifiers>();

/** Returns the specifiers a file's static imports, re-exports and literal dynamic imports name. */
export function importSpecifiers(file: string): string[] {
  const { mtimeMs, size } = statSync(file);
  const known = read.get(file);
  if (known?.mtimeMs === mtimeMs && known.size === size) {
    return known.specifiers;
  }
  const code = readFileSync(file, "utf8");
  const { module } = parseSync(file, code);
  const specifiers = [
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap((entry) =>
      entry.entries.flatMap((name) => (name.moduleRequest ? [name.moduleRequest.value] : [])),
    ),
    ...module.dynamicImports.flatMap((entry) => {
      const match = literal.exec(code.slice(entry.moduleRequest.start, entry.moduleRequest.end));
      return match?.[2] === undefined ? [] : [match[2]];
    }),
  ];
  read.set(file, { mtimeMs, size, specifiers });
  return specifiers;
}
