// The parts of `kk-forge/layers` that count imports across modules. An entities module is what two or more modules of
// features, orchestration or entities import. An orchestration module imports two or more features. oxlint lints one
// file at a time, so the checks read these imports from disk.
import { readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import { importSpecifiers, sourceFile, sourceFiles } from "./imports.js";
import {
  declarationFile,
  fileAt,
  pathFrom,
  type Layer,
  type Place,
  placeOfImport,
  testFile,
} from "./places.js";
import { newRecent } from "./recent.js";

// The checks count no import from an entrypoint, which takes an entity's type from a feature's surface. A feature's
// infra/ sits in its feature, so its imports count as the feature's. The root infra and shared import no entity.
const consumerLayers: readonly Layer[] = ["features", "orchestration", "entities"];

/** A module a file imports: its layer and its folder, or its file when the module is one file. */
interface Target {
  layer: Layer;
  module: string;
}

/**
 * Holds the modules each file imports, with the specifiers they were placed from. `importSpecifiers` returns the same
 * array until the file changes, so the checks place a file's imports again only after it changes.
 */
const imports = new Map<string, { specifiers: string[]; targets: Target[] }>();

/** Returns the modules in the layers that a file imports. */
function importedModules(file: string): Target[] {
  const specifiers = importSpecifiers(file);
  const known = imports.get(file);
  if (known?.specifiers === specifiers) {
    return known.targets;
  }
  const targets = specifiers.flatMap((specifier) => {
    const to = placeOfImport(file, specifier);
    return to ? [{ layer: to.layer, module: to.module }] : [];
  });
  imports.set(file, { specifiers, targets });
  return targets;
}

/** Returns a module's name as the reports print it, such as `features/a`. */
function nameOf(root: string, module: string): string {
  return pathFrom(root, module).replace(sourceFile, "");
}

/**
 * Holds the modules each module of `consumerLayers` imports, by module path, for each src/ folder. One oxlint run lints
 * every anchor of an app within moments, so the checks share one walk of the layers.
 */
const moduleMaps = newRecent<Map<string, Target[]>>();

/** Returns which modules each module of `consumerLayers` imports. `root` is the src/ folder of the app. */
function moduleImports(root: string): Map<string, Target[]> {
  return moduleMaps(root, () => {
    const map = new Map<string, Target[]>();
    for (const layer of consumerLayers) {
      for (const file of sourceFiles(join(root, layer))) {
        // A module is the folder or file directly under its layer.
        const [name = ""] = relative(join(root, layer), file).split(/[/\\]/);
        const module = join(root, layer, name);
        map.set(module, [...(map.get(module) ?? []), ...importedModules(file)]);
      }
    }
    return map;
  });
}

/** The src/ folder of an app that a declared pair lets import this one, and the app's folder as the reports name it. */
export interface ImporterRoot {
  root: string;
  app: string;
}

/**
 * Returns the names of the modules of `consumerLayers`, other than `entity` itself, that import the entities module
 * `entity`, sorted. A module of an app in `importers` counts too, named with its app, as `apps/a/features/x`.
 */
function consumersOf(root: string, entity: string, importers: readonly ImporterRoot[]): string[] {
  const named = (from: string, prefix: string) =>
    [...moduleImports(from)]
      .filter(
        ([module, targets]) => module !== entity && targets.some((to) => to.module === entity),
      )
      .map(([module]) => `${prefix}${nameOf(from, module)}`);
  return [
    ...named(root, ""),
    ...importers.flatMap((importer) => named(importer.root, `${importer.app}/`)),
  ].toSorted((left, right) => left.localeCompare(right));
}

/** Returns the names of the features modules that the files of an orchestration module import, sorted. */
function featuresOf(root: string, module: string): string[] {
  const features = (moduleImports(root).get(module) ?? []).flatMap((to) =>
    to.layer === "features" ? [nameOf(root, to.module)] : [],
  );
  return [...new Set(features)].toSorted((left, right) => left.localeCompare(right));
}

/**
 * Returns whether a file is where a check reports on its module: the module's own file, or the first file by name
 * directly in the module's folder that is no test or declaration file. The check so reports once per module.
 */
function isAnchor(filename: string, from: Place): boolean {
  // A declaration file only describes types, so a check reports on a source file of the module instead.
  if (declarationFile.test(filename)) {
    return false;
  }
  if (from.module === filename) {
    return true;
  }
  if (dirname(filename) !== from.module) {
    return false;
  }
  const first = readdirSync(from.module, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        sourceFile.test(entry.name) &&
        !testFile.test(entry.name) &&
        !declarationFile.test(entry.name),
    )
    .map((entry) => entry.name)
    .toSorted()[0];
  return first === basename(filename);
}

const entityHint = "since an entity is what two or more of them share";
const orchestrationHint =
  "since an orchestration module builds one action from two or more features";

function entityProblem(from: Place, importers: readonly ImporterRoot[]): string | undefined {
  const name = nameOf(from.root, from.module);
  const consumers = consumersOf(from.root, from.module, importers);
  const [only] = consumers;
  if (only === undefined) {
    return `No features, orchestration or entities module imports ${name}: move it into the module that uses it, ${entityHint}.`;
  }
  if (consumers.length > 1) {
    return undefined;
  }
  // The message sends the entity into a feature, not an orchestration module. An orchestration module holds no logic of
  // its own.
  const destination = only.startsWith("orchestration/") ? `a feature that ${only} uses` : only;
  return `Only ${only} imports ${name}: move it into ${destination}, ${entityHint}.`;
}

function orchestrationProblem(from: Place): string | undefined {
  const name = nameOf(from.root, from.module);
  const features = featuresOf(from.root, from.module);
  const [only] = features;
  if (only === undefined) {
    return `${name} imports no feature: move it into the feature or entrypoint that uses it, ${orchestrationHint}.`;
  }
  if (features.length > 1) {
    return undefined;
  }
  return `${name} imports only ${only}: move it into ${only}, and let the entrypoint start that feature directly, ${orchestrationHint}.`;
}

/**
 * Returns why the entities or orchestration module of a file imports or is imported too little, or undefined when it
 * does not, or when the file is not where the check reports on its module. `importers` are the apps a declared pair
 * lets import this one, whose imports of an entity count as well.
 */
export function moduleProblem(
  filename: string,
  from: Place,
  importers: readonly ImporterRoot[] = [],
): string | undefined {
  if ((from.layer !== "entities" && from.layer !== "orchestration") || !isAnchor(filename, from)) {
    return undefined;
  }
  return from.layer === "entities" ? entityProblem(from, importers) : orchestrationProblem(from);
}

/**
 * Returns the entities modules a feature's port imports, the port being `port.ts` or the files under `port/` in the
 * feature module `feature`. The feature's infra imports only these entities.
 */
export function portEntities(feature: string): string[] {
  const file = fileAt(join(feature, "port"));
  const files = file === undefined ? sourceFiles(join(feature, "port")) : [file];
  return files.flatMap((portFile) =>
    importedModules(portFile).flatMap((to) => (to.layer === "entities" ? [to.module] : [])),
  );
}
