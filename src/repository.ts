// The apps and packages of a monorepo, as architecture/core.md lays them out: each app in apps/<name>/ and each package
// in packages/<name>/, each with its own src/, under a root whose package.json declares `workspaces` or that holds a
// pnpm-workspace.yaml. The checks read that layout and the name in each package.json, so a repository laid out
// otherwise gets none of them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

import { importSpecifiers, sourceFiles } from "./imports.js";
import { declarationFile, importTarget, isLayer, type Layer, pathFrom } from "./places.js";
import { newRecent } from "./recent.js";

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

/** Holds whether each folder is a workspace root. */
const workspaceRoots = newRecent<boolean>();

/**
 * Returns whether a folder is the root of a workspace: its package.json declares `workspaces`, or it holds a
 * pnpm-workspace.yaml. A single repository cloned under a folder named apps or packages is no such root, so its
 * siblings stay out of its checks.
 */
function isWorkspaceRoot(dir: string): boolean {
  return workspaceRoots(dir, () => {
    const manifest = readManifest(dir);
    return (
      (typeof manifest === "object" && manifest !== null && "workspaces" in manifest) ||
      existsSync(join(dir, "pnpm-workspace.yaml"))
    );
  });
}

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

/** Returns what the package.json in a folder holds, or undefined when there is none or it does not parse. */
function readManifest(dir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Returns whether the package.json of a package marks it a technical engine, with `"layers": { "kind": "engine" }`.
 * architecture/core.md keeps such a package apart from its app even when one app alone uses it.
 */
function isEngine(dir: string): boolean {
  const manifest = readManifest(dir);
  const marks =
    typeof manifest === "object" && manifest !== null && "layers" in manifest
      ? manifest.layers
      : undefined;
  return typeof marks === "object" && marks !== null && "kind" in marks && marks.kind === "engine";
}

/** Returns the name the package.json of an app or package declares, or undefined when it declares none. */
function declaredName(dir: string): string | undefined {
  const manifest = readManifest(dir);
  const name =
    typeof manifest === "object" && manifest !== null && "name" in manifest
      ? manifest.name
      : undefined;
  return typeof name === "string" ? name : undefined;
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

/** Returns the package name a bare specifier names, as `@repo/x` of `@repo/x/infra`, and the path after it. */
function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split("/");
  const length = specifier.startsWith("@") ? 2 : 1;
  return { name: parts.slice(0, length).join("/"), subpath: parts.slice(length).join("/") };
}

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

/** What an import names of the repository's layout. */
export type RepositoryImport =
  /** An import the layout forbids, and why. */
  | { problem: string }
  /** The surface of another package for a layer, such as `@repo/logger/infra` for its `infra`. */
  | { layer: Layer; specifier: string }
  /** An import the layout leaves to the other checks. */
  | undefined;

/**
 * Returns what an import from the app or package `from` names of the repository: another app, the surface of a package
 * for a layer, or a path into another app or package.
 */
export function repositoryImport(
  from: Unit,
  filename: string,
  specifier: string,
): RepositoryImport {
  const { named } = repositoryMap(from.repo);
  const { name, subpath } = splitSpecifier(specifier);
  const byName = specifier.startsWith(".") ? undefined : named.get(name);
  const target = byName ? undefined : importTarget(filename, specifier);
  const to = byName ?? (target === undefined ? undefined : unitOfPath(from.repo, target));
  if (!to || to.dir === from.dir) {
    return undefined;
  }
  if (to.kind === UnitKind.App) {
    return { problem: from.kind === UnitKind.App ? appSourceProblem : packageImportsAppProblem };
  }
  if (!byName) {
    const packageName = declaredName(to.dir) ?? folderOf(to);
    return {
      problem: `Import ${packageName} by its name, through the surface of a layer, not by a path into it.`,
    };
  }
  // The bare name is the package's shared. A path that names no layer, such as its testing entry, is no layer's surface.
  const layer = subpath === "" ? "shared" : subpath;
  return isLayer(layer) ? { layer, specifier } : undefined;
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
