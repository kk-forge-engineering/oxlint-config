// What package.json files say: a field of one, which folder is a workspace root, the name each app declares, and the
// `exports` through which one app imports another. src/repository.ts judges the imports between apps and packages,
// and src/places.ts resolves an app's name through these, so every check that reads an import places it alike.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { newRecent } from "./recent.js";

/** Returns what the package.json in a folder holds, or undefined when there is none or it does not parse. */
function readManifest(dir: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

/** Returns a field of the package.json in a folder, or undefined when it has no such field or no package.json. */
export function manifestField(dir: string, field: string): unknown {
  const manifest = readManifest(dir);
  return typeof manifest === "object" && manifest !== null
    ? new Map<string, unknown>(Object.entries(manifest)).get(field)
    : undefined;
}

/** Returns the name the package.json of an app or package declares, or undefined when it declares none. */
export function declaredName(dir: string): string | undefined {
  const name = manifestField(dir, "name");
  return typeof name === "string" ? name : undefined;
}

/** Holds whether each folder is a workspace root. */
const workspaceRoots = newRecent<boolean>();

/**
 * Returns whether a folder is the root of a workspace: its package.json declares `workspaces`, or it holds a
 * pnpm-workspace.yaml. A single repository cloned under a folder named apps or packages is no such root, so its
 * siblings stay out of its checks.
 */
export function isWorkspaceRoot(dir: string): boolean {
  return workspaceRoots(
    dir,
    () =>
      manifestField(dir, "workspaces") !== undefined ||
      existsSync(join(dir, "pnpm-workspace.yaml")),
  );
}

/** Returns the package name a bare specifier names, as `@repo/x` of `@repo/x/infra`, and the path after it. */
export function splitSpecifier(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split("/");
  const length = specifier.startsWith("@") ? 2 : 1;
  return { name: parts.slice(0, length).join("/"), subpath: parts.slice(length).join("/") };
}

/** The segments Node refuses in a subpath, so a path made of the others stays inside the folder it maps to. */
const refusedSegments: ReadonlySet<string> = new Set(["", ".", "..", "node_modules"]);

/** Returns whether a subpath holds a segment Node refuses, so it names no file of the folder it maps to. */
export const holdsRefusedSegment = (subpath: string): boolean =>
  subpath.split(/[\\/]/).some((segment) => refusedSegments.has(segment));

/** The one `exports` form through which another app imports an app: each path under its src/. */
export const appExportsForm = { key: "./*", target: "./src/*" } as const;

/**
 * Returns the file an import by name of the app in `dir` names under its src/, or why it names none: `form` when its
 * package.json `exports` is not `appExportsForm` alone, `path` when the subpath is empty or holds a segment Node
 * refuses.
 */
export function appExportPath(dir: string, subpath: string): { target: string } | "form" | "path" {
  const exports = manifestField(dir, "exports");
  // Any other key would send its paths elsewhere, so the form is that one key alone.
  const declared =
    typeof exports === "object" &&
    exports !== null &&
    Object.keys(exports).length === 1 &&
    appExportsForm.key in exports &&
    exports[appExportsForm.key] === appExportsForm.target;
  if (!declared) {
    return "form";
  }
  return holdsRefusedSegment(subpath) ? "path" : { target: join(dir, "src", subpath) };
}

/** Holds the folder of each app of a repository by the name its package.json declares. */
const appNames = newRecent<Map<string, string>>();

/** Returns the folder of each app of a repository by its declared name. */
function appsByName(repo: string): Map<string, string> {
  return appNames(repo, () => {
    const apps = new Map<string, string>();
    let entries;
    try {
      entries = readdirSync(join(repo, "apps"), { withFileTypes: true });
    } catch {
      return apps;
    }
    for (const entry of entries.filter((each) => each.isDirectory())) {
      const dir = join(repo, "apps", entry.name);
      const name = declaredName(dir);
      if (name !== undefined) {
        apps.set(name, dir);
      }
    }
    return apps;
  });
}

/** Returns the workspace root whose apps/ or packages/ holds a file, or undefined outside one. */
function repoOf(filename: string): string | undefined {
  for (let dir = dirname(filename); dirname(dir) !== dir; dir = dirname(dir)) {
    const [folder] = relative(dirname(dir), filename).split(sep);
    if ((folder === "apps" || folder === "packages") && isWorkspaceRoot(dirname(dir))) {
      return dirname(dir);
    }
  }
  return undefined;
}

/**
 * Returns the file a specifier names when it names an app of the file's repository by name through that app's
 * `exports`, or undefined otherwise. Whether the import may take that app is src/repository.ts's to judge.
 */
export function appTarget(filename: string, specifier: string): string | undefined {
  const repo = repoOf(filename);
  if (repo === undefined) {
    return undefined;
  }
  const { name, subpath } = splitSpecifier(specifier);
  const dir = appsByName(repo).get(name);
  const path = dir === undefined ? undefined : appExportPath(dir, subpath);
  return typeof path === "object" ? path.target : undefined;
}
