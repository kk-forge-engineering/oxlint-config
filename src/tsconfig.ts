// Resolves an import through the `paths` of the tsconfig.json nearest to the importing file, as TypeScript does, so an
// alias means exactly what the project's config says. tsconfig.json is JSON with comments and trailing commas, which
// oxc-parser reads as a JavaScript object literal inside parentheses, the closing one on a line of its own.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { parseSync } from "oxc-parser";

/** One `paths` entry: the pattern's text before and after its `*`, whether it has one, and the targets it maps to. */
interface PathPattern {
  prefix: string;
  suffix: string;
  wildcard: boolean;
  targets: string[];
}

/** The `paths` a tsconfig.json declares or inherits, with the folder its targets resolve from. */
interface Paths {
  base: string;
  patterns: PathPattern[];
}

type Program = ReturnType<typeof parseSync>["program"];
type Expression = Extract<Program["body"][number], { type: "ExpressionStatement" }>["expression"];

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Returns the JSON value an expression of a JSON text spells, or undefined for anything else. */
function valueOf(node: Expression | null): Json | undefined {
  if (node === null) {
    return undefined;
  }
  if (node.type === "Literal") {
    return typeof node.value === "bigint" || node.value instanceof RegExp ? undefined : node.value;
  }
  if (node.type === "ArrayExpression") {
    return node.elements.flatMap((element) => {
      const value =
        element === null || element.type === "SpreadElement" ? undefined : valueOf(element);
      return value === undefined ? [] : [value];
    });
  }
  if (node.type === "ObjectExpression") {
    const object: { [key: string]: Json } = {};
    for (const property of node.properties) {
      if (property.type !== "Property") {
        continue;
      }
      const key =
        property.key.type === "Literal"
          ? property.key.value
          : property.key.type === "Identifier"
            ? property.key.name
            : undefined;
      const value = valueOf(property.value);
      if (typeof key === "string" && value !== undefined) {
        object[key] = value;
      }
    }
    return object;
  }
  return undefined;
}

/** Returns whether a JSON value is an object. */
const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Returns the object a tsconfig.json holds, or an empty one when it does not parse. */
function readConfig(file: string): { [key: string]: Json } {
  const { program, errors } = parseSync("tsconfig.ts", `(${readFileSync(file, "utf8")}\n)`, {
    preserveParens: false,
  });
  const statement = program.body[0];
  const value =
    errors.length === 0 && statement?.type === "ExpressionStatement"
      ? valueOf(statement.expression)
      : undefined;
  return isObject(value) ? value : {};
}

/** Returns the file an `extends` entry names, as TypeScript finds it, or undefined when it names none. */
function extendedFile(from: string, entry: string): string | undefined {
  if (entry.startsWith(".") || entry.startsWith("/")) {
    const path = resolve(dirname(from), entry);
    return [path, `${path}.json`].find((file) => existsSync(file) && statSync(file).isFile());
  }
  // A package's main entry is its code, so only a JSON file it resolves to is its config.
  const require = createRequire(from);
  for (const request of [entry, `${entry}.json`, `${entry}/tsconfig.json`]) {
    try {
      const file = require.resolve(request);
      if (file.endsWith(".json")) {
        return file;
      }
    } catch {
      // The next form may resolve.
    }
  }
  return undefined;
}

/**
 * Returns the value of one compiler option a tsconfig.json declares or inherits through `extends`, with the folder of
 * the file that declares it. A later entry of `extends` overrides an earlier one, and the file itself overrides both.
 */
function inheritedOption(
  file: string,
  name: string,
  seen = new Set<string>(),
  read = seen,
): { value: Json; dir: string } | undefined {
  if (seen.has(file)) {
    return undefined;
  }
  seen.add(file);
  read.add(file);
  const config = readConfig(file);
  const options = config["compilerOptions"];
  const value = isObject(options) ? options[name] : undefined;
  if (value !== undefined) {
    return { value, dir: dirname(file) };
  }
  const entries = config["extends"];
  const parents = (Array.isArray(entries) ? entries : [entries]).filter(
    (entry) => typeof entry === "string",
  );
  for (const entry of parents.toReversed()) {
    const parent = extendedFile(file, entry);
    const inherited = parent === undefined ? undefined : inheritedOption(parent, name, seen, read);
    if (inherited) {
      return inherited;
    }
  }
  return undefined;
}

/**
 * Returns the `paths` that apply in a tsconfig.json. Like TypeScript, it takes `paths` and `baseUrl` each from the
 * nearest file that declares it. A target resolves from `baseUrl` when one is set, and from the folder of the file
 * that declares `paths` otherwise. `${configDir}` names the folder of the tsconfig.json itself.
 */
function pathsOf(file: string, read: Set<string>): Paths | undefined {
  const paths = inheritedOption(file, "paths", read);
  if (!paths || !isObject(paths.value)) {
    return undefined;
  }
  const configDir = dirname(file);
  const atConfigDir = (path: string) => path.replaceAll("${configDir}", configDir);
  const patterns = Object.entries(paths.value).map(([pattern, targets]): PathPattern => {
    const star = pattern.indexOf("*");
    return {
      prefix: star < 0 ? pattern : pattern.slice(0, star),
      suffix: star < 0 ? "" : pattern.slice(star + 1),
      wildcard: star >= 0,
      targets: Array.isArray(targets)
        ? targets.filter((target) => typeof target === "string").map(atConfigDir)
        : [],
    };
  });
  const baseUrl = inheritedOption(file, "baseUrl", new Set(), read);
  const base =
    baseUrl !== undefined && typeof baseUrl.value === "string"
      ? resolve(baseUrl.dir, atConfigDir(baseUrl.value))
      : paths.dir;
  return { base, patterns };
}

// The `paths` of each tsconfig.json read so far, with the time and size of every file read for them, the files it
// extends included. A long-lived oxlint, such as the language server's, reads a config again once any of them changes.
const configs = new Map<string, { stamps: Map<string, string>; paths: Paths | undefined }>();

/** Returns a file's time and size as one value, or "" when the file is gone. */
function stampOf(file: string): string {
  if (!existsSync(file)) {
    return "";
  }
  const { mtimeMs, size } = statSync(file);
  return `${mtimeMs}:${size}`;
}

/** Returns the `paths` that apply to a file: those of the nearest tsconfig.json above it. */
function pathsFor(filename: string): Paths | undefined {
  for (let dir = dirname(filename); ; dir = dirname(dir)) {
    const file = join(dir, "tsconfig.json");
    if (existsSync(file)) {
      const known = configs.get(file);
      if (known && [...known.stamps].every(([read, stamp]) => stampOf(read) === stamp)) {
        return known.paths;
      }
      const read = new Set<string>();
      const paths = pathsOf(file, read);
      configs.set(file, { stamps: new Map([...read].map((path) => [path, stampOf(path)])), paths });
      return paths;
    }
    if (dirname(dir) === dir) {
      return undefined;
    }
  }
}

/**
 * Returns the path an import specifier names through the `paths` of the importing file's tsconfig.json, or undefined
 * when no pattern matches it, as for a package. Of several matching patterns the one with the longest prefix wins, and
 * of its targets the first that exists, as in TypeScript.
 */
export function aliasTarget(
  filename: string,
  specifier: string,
  exists: (path: string) => boolean,
): string | undefined {
  const paths = pathsFor(filename);
  if (!paths) {
    return undefined;
  }
  const matches = paths.patterns
    .filter(({ prefix, suffix, wildcard }) =>
      wildcard
        ? specifier.length >= prefix.length + suffix.length &&
          specifier.startsWith(prefix) &&
          specifier.endsWith(suffix)
        : specifier === prefix,
    )
    .toSorted((left, right) => right.prefix.length - left.prefix.length);
  const [match] = matches;
  if (!match) {
    return undefined;
  }
  const captured = match.wildcard
    ? specifier.slice(match.prefix.length, specifier.length - match.suffix.length)
    : "";
  const targets = match.targets.map((target) => resolve(paths.base, target.replace("*", captured)));
  return targets.find(exists) ?? targets[0];
}
