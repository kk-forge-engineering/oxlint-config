// Resolves an import such as `#src/features/a/exports` through the `imports` field of the package.json nearest to the
// importing file. Each app and package of a monorepo so names its own src/. The layers read two keys only,
// `"#src/*": "./src/*"` and `"#tests/*": "./tests/*"` for the test helpers beside src/, so each means the same in every
// project, and any other form is a problem the rule reports. A project that Node runs from its build may write `#src/*`
// as `{ "source": "./src/*", "default": "./dist/*" }`: tools that take the "source" condition read src/, and Node
// reads dist/.
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { newRecent } from "./recent.js";
import { holdsRefusedSegment, manifestField } from "./workspace.js";

/** The subpath imports the layers read: each key, its target, the folder it names and the prefix a specifier takes. */
const forms = [
  { key: "#src/*", target: "./src/*", folder: "src", prefix: "#src/" },
  { key: "#tests/*", target: "./tests/*", folder: "tests", prefix: "#tests/" },
] as const;

/** Returns how package.json writes some of the forms in its `imports`, for the reports. */
const declarationOf = (declared: readonly { key: string; target: string }[]): string =>
  `"imports": { ${declared.map(({ key, target }) => `"${key}": "${target}"`).join(", ")} }`;

/** The conditions of the `#src/*` form for a project that Node runs from its build, in the order Node tries them. */
const builtForm = [
  ["source", "./src/*"],
  ["default", "./dist/*"],
] as const;

/** How package.json writes the `#src/*` form for a project that Node runs from its build, for the reports. */
const builtDeclaration = `"imports": { "#src/*": { ${builtForm.map(([condition, target]) => `"${condition}": "${target}"`).join(", ")} } }`;

/** Returns whether an `imports` value is the `#src/*` form for a project that Node runs from its build, keys in order. */
function isBuiltForm(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const entries = Object.entries(value);
  return (
    entries.length === builtForm.length &&
    entries.every(
      ([condition, target], at) => condition === builtForm[at][0] && target === builtForm[at][1],
    )
  );
}

/** Returns whether package.json declares a form as the layers read it. */
const declares = (scope: Scope | undefined, form: (typeof forms)[number]): boolean => {
  const value = scope?.imports.get(form.key);
  return value === form.target || (form.key === "#src/*" && isBuiltForm(value));
};

/** Returns the forms a report names for a prefix: `#src/` has two, `#tests/` one. */
const formsOf = (form: (typeof forms)[number]): string =>
  form.key === "#src/*"
    ? `${declarationOf([form])} or ${builtDeclaration}, the forms`
    : `${declarationOf([form])}, the one form`;

/** The `#src/` form as a report names it, the one way to import from the file's own src/. */
export const srcSubpathImport = `#src/, which package.json declares as ${declarationOf([forms[0]])}`;

/** Returns why a specifier that names the importing file's own src/ other than through `#src/` fails. */
export const ownSrcProblem = (specifier: string): string =>
  `Import ${specifier} through ${srcSubpathImport}, since it names this src/ another way.`;

/** The nearest package.json and the `imports` it declares, none when it declares no object. */
interface Scope {
  file: string;
  imports: Map<string, unknown>;
}

/** Holds the scope of each folder. */
const scopes = newRecent<Scope | undefined>();

/** Returns the package.json nearest to a folder with its `imports`, or undefined when there is no package.json. */
function scopeOf(dir: string): Scope | undefined {
  return scopes(dir, () => {
    for (let at = dir; ; at = dirname(at)) {
      const file = join(at, "package.json");
      if (existsSync(file)) {
        const imports = manifestField(at, "imports");
        return {
          file,
          imports:
            typeof imports === "object" && imports !== null && !Array.isArray(imports)
              ? new Map<string, unknown>(Object.entries(imports))
              : new Map<string, unknown>(),
        };
      }
      if (dirname(at) === at) {
        return undefined;
      }
    }
  });
}

/** Returns the folder of the package.json nearest to a file, whose src/ and tests/ `#src/` and `#tests/` name. */
export function packageRoot(filename: string): string | undefined {
  const scope = scopeOf(dirname(filename));
  return scope === undefined ? undefined : dirname(scope.file);
}

/** Returns whether an `imports` key matches a specifier: exactly, or as a pattern with one `*`. */
function matches(key: string, specifier: string): boolean {
  const star = key.indexOf("*");
  if (star < 0) {
    return key === specifier;
  }
  return (
    star === key.lastIndexOf("*") &&
    specifier.length >= key.length &&
    specifier.startsWith(key.slice(0, star)) &&
    specifier.endsWith(key.slice(star + 1))
  );
}

/** What a `#` specifier names: the path it resolves to, why its form is wrong, or undefined for no subpath import. */
export type SubpathImport = { target: string } | { problem: string } | undefined;

/**
 * Returns what a specifier names through the `imports` of the importing file's package.json. A `#src/` specifier needs
 * `"#src/*": "./src/*"` there, or its form for a project that Node runs from its build, a `#tests/` one `"#tests/*": "./tests/*"`, and a specifier another key of `imports`
 * matches takes the wrong form. A `#` specifier that no key matches, such as WXT's `#imports`, is left to the
 * tsconfig.json `paths`.
 */
export function subpathImport(filename: string, specifier: string): SubpathImport {
  if (!specifier.startsWith("#")) {
    return undefined;
  }
  const scope = scopeOf(dirname(filename));
  const manifest = scope ? relative(process.cwd(), scope.file) || "package.json" : "package.json";
  // Any other key that matches decides where the import goes, a narrower one inside #src/ included, as Node takes the
  // longest match, so it fails before the forms are read.
  const key = scope
    ? [...scope.imports.keys()].find(
        (name) => !forms.some((each) => each.key === name) && matches(name, specifier),
      )
    : undefined;
  if (key !== undefined) {
    return {
      problem: `Import ${specifier} through #src/ or #tests/, not through ${key}, a key of ${manifest} the layers do not read: they read only ${declarationOf(forms)}.`,
    };
  }
  const form = forms.find(({ prefix }) => specifier.startsWith(prefix));
  if (form) {
    const rest = specifier.slice(form.prefix.length);
    if (holdsRefusedSegment(rest)) {
      return {
        problem: `${specifier} holds a segment Node refuses, such as .., so it names no file of ${form.folder}/.`,
      };
    }
    return scope && declares(scope, form)
      ? { target: resolve(dirname(scope.file), form.folder, rest) }
      : {
          problem: `${manifest} declares no ${formsOf(form)} through which ${form.prefix} names ${form.folder}/.`,
        };
  }
  return undefined;
}
