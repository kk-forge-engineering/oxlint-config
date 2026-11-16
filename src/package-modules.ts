// The modules inside a layer module of a package. architecture/core.md lets a large package split a layer module into
// modules: a folder with an exports.ts, which code outside that folder imports only through its exports.ts.
import { dirname, join, sep } from "node:path";

import { fileAt, importTarget, isFeatureInfra, pathFrom, type Place } from "./places.js";

/** Returns whether `path` is `folder` or sits inside it. */
const isWithin = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(folder + sep);

/**
 * Returns why `filename` in a package's layer module imports a module inside it past that module's
 * exports.ts, or undefined when it does not. The layer rules judge an import from outside the layer
 * module. A feature holds no such modules: its infra/ has rules of its own, and a large feature
 * splits.
 */
export function innerModuleProblem({
  filename,
  specifier,
  to,
}: {
  filename: string;
  specifier: string;
  to: Place;
}): string | undefined {
  if (to.file || to.layer === "features" || isFeatureInfra(to) || !isWithin(filename, to.module)) {
    return undefined;
  }
  const target = importTarget(filename, specifier);
  if (target === undefined) {
    return undefined;
  }
  const folders: string[] = [];
  for (
    let folder = dirname(target);
    folder !== to.module && isWithin(folder, to.module);
    folder = dirname(folder)
  ) {
    folders.unshift(folder);
  }
  const file = fileAt(target);
  // A path that names a folder is that folder's own module too.
  if (target !== to.module && file === undefined) {
    folders.push(target);
  }
  const exportsOf = (folder: string) => fileAt(join(folder, "exports"));
  const module = folders.find(
    (folder) => !isWithin(filename, folder) && exportsOf(folder) !== undefined,
  );
  if (module === undefined || file === exportsOf(module)) {
    return undefined;
  }
  return `Import ${pathFrom(to.root, module)} only through its exports.ts.`;
}
