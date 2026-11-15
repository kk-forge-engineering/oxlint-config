// The parts of `kk-forge/layers` that count imports across modules. An entities module is what two or more modules of
// features, orchestration or entities import. An orchestration module imports two or more features. oxlint lints one
// file at a time, so the checks read these imports from disk.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import { parseSync } from "oxc-parser";

import {
  declarationFile,
  fileAt,
  type Layer,
  type Place,
  placeOfImport,
  testFile,
} from "./places.js";

// The checks count no import from an entrypoint, which takes an entity's type from a feature's surface. A feature's
// infra/ sits in its feature, so its imports count as the feature's. The root infra and shared import no entity.
const consumerLayers: readonly Layer[] = ["features", "orchestration", "entities"];

const sourceFile = /\.[cm]?[jt]sx?$/;
// The checks count a dynamic import only when a string literal, or a template literal without a placeholder, names its
// module.
const literal = /^(["'`])([^"'`$]*)\1$/;

/** A module a file imports: its layer and its folder, or its file when the module is one file. */
interface Target {
  layer: Layer;
  module: string;
}

interface Imports {
  mtimeMs: number;
  size: number;
  targets: Target[];
}

/**
 * Holds the imports of each file read so far. A long-lived oxlint, such as the language server, reads a file again only
 * once its time or size changes.
 */
const imports = new Map<string, Imports>();

/** Returns every source file under a folder that is no test, or none when the folder is missing. */
function sourceFiles(dir: string): string[] {
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
    // The checks skip a test file. A test follows its code, so it makes no consumer and adds no feature to an
    // orchestration module.
    return entry.isFile() && sourceFile.test(entry.name) && !testFile.test(entry.name)
      ? [path]
      : [];
  });
}

/** Returns the modules in the layers that a file imports. `root` is the src/ folder of the app. */
function importedModules(root: string, file: string): Target[] {
  const { mtimeMs, size } = statSync(file);
  const known = imports.get(file);
  if (known?.mtimeMs === mtimeMs && known.size === size) {
    return known.targets;
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
  const targets = specifiers.flatMap((specifier) => {
    const to = placeOfImport(file, specifier);
    return to ? [{ layer: to.layer, module: to.module }] : [];
  });
  imports.set(file, { mtimeMs, size, targets });
  return targets;
}

/** Returns a module's name as the reports print it, such as `features/a`. */
function nameOf(root: string, module: string): string {
  return relative(root, module).replaceAll("\\", "/").replace(sourceFile, "");
}

/** The modules each module of `consumerLayers` imports, by module path, and when the checks read the map. */
interface ModuleMap {
  readAt: number;
  imports: Map<string, Target[]>;
}

/**
 * Holds the module map of each src/ folder. One oxlint run lints every anchor of an app within moments, so the checks
 * share one walk of the layers. A long-lived oxlint walks again once the map is a second old.
 */
const moduleMaps = new Map<string, ModuleMap>();
const mapLifetimeMilliseconds = 1000;

/** Returns which modules each module of `consumerLayers` imports. `root` is the src/ folder of the app. */
function moduleImports(root: string): Map<string, Target[]> {
  const known = moduleMaps.get(root);
  if (known && performance.now() - known.readAt < mapLifetimeMilliseconds) {
    return known.imports;
  }
  const map = new Map<string, Target[]>();
  for (const layer of consumerLayers) {
    for (const file of sourceFiles(join(root, layer))) {
      // A module is the folder or file directly under its layer.
      const [name = ""] = relative(join(root, layer), file).split(/[/\\]/);
      const module = join(root, layer, name);
      map.set(module, [...(map.get(module) ?? []), ...importedModules(root, file)]);
    }
  }
  moduleMaps.set(root, { readAt: performance.now(), imports: map });
  return map;
}

/**
 * Returns the names of the modules of `consumerLayers`, other than `entity` itself, that import the entities module
 * `entity`, sorted.
 */
function consumersOf(root: string, entity: string): string[] {
  return [...moduleImports(root)]
    .filter(([module, targets]) => module !== entity && targets.some((to) => to.module === entity))
    .map(([module]) => nameOf(root, module))
    .toSorted((left, right) => left.localeCompare(right));
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

function entityProblem(from: Place): string | undefined {
  const name = nameOf(from.root, from.module);
  const consumers = consumersOf(from.root, from.module);
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
 * does not, or when the file is not where the check reports on its module.
 */
export function moduleProblem(filename: string, from: Place): string | undefined {
  if ((from.layer !== "entities" && from.layer !== "orchestration") || !isAnchor(filename, from)) {
    return undefined;
  }
  return from.layer === "entities" ? entityProblem(from) : orchestrationProblem(from);
}

/**
 * Returns the entities modules a feature's port imports, the port being `port.ts` or the files under `port/` in the
 * feature module `feature`. The feature's infra imports only these entities.
 */
export function portEntities(root: string, feature: string): string[] {
  const file = fileAt(join(feature, "port"));
  const files = file === undefined ? sourceFiles(join(feature, "port")) : [file];
  return files.flatMap((portFile) =>
    importedModules(root, portFile).flatMap((to) => (to.layer === "entities" ? [to.module] : [])),
  );
}
