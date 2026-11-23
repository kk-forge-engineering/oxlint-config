// The apps and packages of a monorepo, as architecture/core.md lays them out: each app in apps/<name>/ and each package
// in packages/<name>/, each with its own src/, under a root whose package.json declares `workspaces` or that holds a
// pnpm-workspace.yaml. The checks read that layout and the name in each package.json, so a repository laid out
// otherwise gets none of them.
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

import { importSpecifiers, sourceFiles } from "./imports.js";
import type { ImporterRoot } from "./module-counts.js";
import { declarationFile, importTarget, isLayer, type Layer, pathFrom } from "./places.js";
import { newRecent } from "./recent.js";
import { ownSrcProblem } from "./subpath-imports.js";
import {
  appExportPath,
  appExportsForm,
  declaredName,
  isWorkspaceRoot,
  manifestField,
  splitSpecifier,
} from "./workspace.js";

export enum UnitKind {
  App = "apps",
  Package = "packages",
}

/** An app or a package of a monorepo. */
export interface Unit {
  kind: UnitKind;
  /** The folder of the app or package, such as `<repo>/apps/web`. */
  dir: string;
  /** The folder that holds apps/ and packages/. */
  repo: string;
}

const kindOf = (folder: string): UnitKind | undefined =>
  folder === "apps" ? UnitKind.App : folder === "packages" ? UnitKind.Package : undefined;

/** Returns the app or package whose src/ folder `root` is, or undefined outside the layout. */
export function unitOfRoot(root: string): Unit | undefined {
  const dir = dirname(root);
  const kind = kindOf(basename(dirname(dir)));
  const repo = dirname(dirname(dir));
  return kind === undefined || !isWorkspaceRoot(repo) ? undefined : { kind, dir, repo };
}

/** Returns the app or package of `repo` that a path sits in, or undefined when it sits in none. */
function unitOfPath(repo: string, path: string): Unit | undefined {
  const [folder = "", name] = relative(repo, path).split(sep);
  const kind = kindOf(folder);
  return kind === undefined || name === undefined
    ? undefined
    : { kind, dir: join(repo, folder, name), repo };
}

/** Returns the app or package whose src/ holds a file, or undefined outside the layout. */
export function unitOfFile(filename: string): Unit | undefined {
  const parts = filename.split(sep);
  for (let src = parts.lastIndexOf("src"); src > 1; src = parts.lastIndexOf("src", src - 1)) {
    const unit = unitOfRoot(parts.slice(0, src + 1).join(sep));
    if (unit) {
      return unit;
    }
  }
  return undefined;
}

/**
 * Returns whether the package.json of a package marks it a technical engine, with `"layers": { "kind": "engine" }`.
 * architecture/core.md keeps such a package apart from its app even when one app alone uses it.
 */
function isEngine(dir: string): boolean {
  const marks = manifestField(dir, "layers");
  return typeof marks === "object" && marks !== null && "kind" in marks && marks.kind === "engine";
}

/** The apps and packages of a repository, their names, and the names each one imports. */
interface RepositoryMap {
  /** Every app and package, an app whose package.json declares no name included. */
  units: Unit[];
  /** The apps and packages whose package.json declares a name, by that name. */
  named: Map<string, Unit>;
  /** The names of the apps and packages that each folder's source files import, by the folder of the app or package. */
  importedNames: Map<string, Set<string>>;
}

/**
 * Holds the map of each repository. One oxlint run lints every file of a package within moments, so the checks share
 * one walk of the repository.
 */
const repositoryMaps = newRecent<RepositoryMap>();

/** Returns the names of the repository's apps and packages, and the ones each of them imports. */
function repositoryMap(repo: string): RepositoryMap {
  return repositoryMaps(repo, () => {
    const units = [UnitKind.App, UnitKind.Package].flatMap((kind) => {
      let entries;
      try {
        entries = readdirSync(join(repo, kind), { withFileTypes: true });
      } catch {
        return [];
      }
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({ kind, dir: join(repo, kind, entry.name), repo }));
    });
    const named = new Map<string, Unit>();
    for (const unit of units) {
      const name = declaredName(unit.dir);
      if (name !== undefined) {
        named.set(name, unit);
      }
    }
    const importedNames = new Map<string, Set<string>>();
    for (const unit of units) {
      const names = sourceFiles(join(unit.dir, "src")).flatMap((file) =>
        importSpecifiers(file).map((specifier) => splitSpecifier(specifier).name),
      );
      importedNames.set(unit.dir, new Set(names.filter((name) => named.has(name))));
    }
    return { units, named, importedNames };
  });
}

/** Returns the name of an app or package as the reports print it, such as `apps/web`. */
const folderOf = (unit: Unit): string => pathFrom(unit.repo, unit.dir);

const appSourceProblem =
  "An import into another app's source is forbidden: move the code both apps use into a package.";
const packageImportsAppProblem = "A package imports no app.";

/**
 * The apps each app may import by name, keyed and listed by folder, such as `apps/a` to `apps/b`. By default an app
 * imports no other app, and a project declares a pair in the rule's options where it needs one. The direction is one
 * way, and any other import of an app stays forbidden.
 */
export type AppImports = ReadonlyMap<string, readonly string[]>;

/**
 * Returns the app pairs the rule's option declares, `{ "apps": { "apps/a": ["apps/b"] } }`, which lets the
 * first app import the second by name.
 */
export function appImportsOf(options: readonly unknown[]): AppImports {
  const [first] = options;
  const apps =
    typeof first === "object" && first !== null && !Array.isArray(first) && "apps" in first
      ? first.apps
      : undefined;
  if (typeof apps !== "object" || apps === null || Array.isArray(apps)) {
    return new Map();
  }
  return new Map(
    Object.entries(apps).map(([app, targets]): [string, string[]] => [
      app,
      Array.isArray(targets) ? targets.filter((target) => typeof target === "string") : [],
    ]),
  );
}

/**
 * Returns the src/ folders of the apps whose declared pairs let them import `unit`, with each app's folder, so the
 * counts of `unit`'s modules take in their imports.
 */
export function pairImporters(unit: Unit | undefined, appImports: AppImports): ImporterRoot[] {
  if (unit?.kind !== UnitKind.App) {
    return [];
  }
  const folder = folderOf(unit);
  return [...appImports]
    .filter(([app, targets]) => app !== folder && targets.includes(folder))
    .map(([app]) => ({ root: join(unit.repo, app, "src"), app }));
}

/** Returns what an import by name of app `to` names through its package.json `exports`, or why the form is wrong. */
function appExport(to: Unit, name: string, subpath: string): RepositoryImport {
  const path = appExportPath(to.dir, subpath);
  if (path === "form") {
    return {
      problem: `The "exports" of ${folderOf(to)}/package.json is not { "${appExportsForm.key}": "${appExportsForm.target}" } alone, the one form through which another app imports it.`,
    };
  }
  return path === "path"
    ? {
        problem: `Import a module of ${folderOf(to)} by its path under src/, as ${name}/features/<name>/exports.`,
      }
    : path;
}

/** What an import names of the repository's layout. */
export type RepositoryImport =
  /** An import the layout forbids, and why. */
  | { problem: string }
  /** A path under the src/ of an app the importing app may take, which the layer checks place as their own. */
  | { target: string }
  /** The surface of another package for a layer, such as `@repo/logger/infra` for its `infra`. */
  | { layer: Layer; surface: string; rest: string }
  /** An import the layout leaves to the other checks. */
  | undefined;

/**
 * Returns what an import from the app or package `from` names of the repository: another app, the surface of a package
 * for a layer, or a path into another app or package. An app imports another app only by name and only where
 * `appImports` declares the pair.
 */
export function repositoryImport(
  from: Unit,
  filename: string,
  specifier: string,
  appImports: AppImports = new Map(),
): RepositoryImport {
  const { named } = repositoryMap(from.repo);
  const { name, subpath } = splitSpecifier(specifier);
  const byName = specifier.startsWith(".") ? undefined : named.get(name);
  const target = byName ? undefined : importTarget(filename, specifier);
  const to = byName ?? (target === undefined ? undefined : unitOfPath(from.repo, target));
  // An app names its own src/ through #/, so its own name would only hide an import from the checks.
  if (byName?.kind === UnitKind.App && byName.dir === from.dir) {
    return {
      problem: ownSrcProblem(specifier),
    };
  }
  // A package can import its own files by relative path. Its name exposes the same layer surfaces to every caller.
  if (
    !to ||
    (to.dir === from.dir && !(byName?.kind === UnitKind.Package && subpath.includes("/")))
  ) {
    return undefined;
  }
  if (to.kind === UnitKind.App) {
    if (
      byName &&
      from.kind === UnitKind.App &&
      appImports.get(folderOf(from))?.includes(folderOf(to)) === true
    ) {
      return appExport(to, name, subpath);
    }
    return { problem: from.kind === UnitKind.App ? appSourceProblem : packageImportsAppProblem };
  }
  if (!byName) {
    const packageName = declaredName(to.dir) ?? folderOf(to);
    return {
      problem: `Import ${packageName} by its name, through the surface of a layer, not by a path into it.`,
    };
  }
  // The bare name is the package's shared. A path that names no layer, such as its testing entry, is no layer's surface.
  const [layer, ...inside] = subpath === "" ? ["shared"] : subpath.split("/");
  if (!isLayer(layer)) {
    return undefined;
  }
  const surface = layer === "shared" ? name : `${name}/${layer}`;
  return { layer, surface, rest: inside.join("/") };
}

/**
 * Returns whether a file is where the check reports on its package: the first source file by path in its src/ that is
 * no test or declaration file. The check so reports once per package.
 */
function isPackageAnchor(filename: string, unit: Unit): boolean {
  const [first] = sourceFiles(join(unit.dir, "src"))
    .filter((file) => !declarationFile.test(file))
    .toSorted();
  return first === filename;
}

const packageHint = "since a package holds the code that two or more apps use";

/**
 * Returns why the package a file sits in serves too few apps, or undefined when it serves two or more, another package
 * imports it, or the file is not where the check reports. A repository without apps/ publishes its packages, so the
 * check leaves it alone.
 */
export function packageProblem(filename: string): string | undefined {
  const unit = unitOfFile(filename);
  if (unit?.kind !== UnitKind.Package || !existsSync(join(unit.repo, UnitKind.App))) {
    return undefined;
  }
  const name = declaredName(unit.dir);
  if (name === undefined || !isPackageAnchor(filename, unit)) {
    return undefined;
  }
  const { units, importedNames } = repositoryMap(unit.repo);
  const importers = units.filter(
    (other) => other.dir !== unit.dir && importedNames.get(other.dir)?.has(name) === true,
  );
  const apps = importers
    .filter((other) => other.kind === UnitKind.App)
    .map(folderOf)
    .toSorted();
  if (apps.length > 1 || importers.some((other) => other.kind === UnitKind.Package)) {
    return undefined;
  }
  const [only] = apps;
  if (only !== undefined && isEngine(unit.dir)) {
    return undefined;
  }
  return only === undefined
    ? `No app or other package imports ${name}: delete it, ${packageHint}.`
    : `Only ${only} imports ${name}, and no other package does: move it into ${only}, ${packageHint}.`;
}
