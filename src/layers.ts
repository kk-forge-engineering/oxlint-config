// The rule `kk-forge/layers`: a file under src/ imports only the layers its own layer may take, and reaches another
// module only through that module's surface file. A file in the tests/ folder beside src/ may import any layer, also
// only through the module's surface file.
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

// The layers each layer may import. A feature takes no other feature and an orchestration no other orchestration,
// so they link through orchestration and entrypoints. Only entrypoints imports infra, which takes entities and shared.
const allowed = {
  entrypoints: ["entrypoints", "orchestration", "features", "entities", "shared", "infra"],
  orchestration: ["features", "entities", "shared"],
  features: ["entities", "shared"],
  entities: ["entities", "shared"],
  shared: ["shared"],
  infra: ["infra", "entities", "shared"],
} as const satisfies Record<string, readonly string[]>;
type Layer = keyof typeof allowed;

// A module is a folder directly under its layer, or a file directly under shared or infra.
const modular = new Set<Layer>([
  "entrypoints",
  "orchestration",
  "features",
  "entities",
  "shared",
  "infra",
]);
// A shared module is one file, which is its own surface, or a folder with its own exports.ts.
const published = new Set<Layer>(["orchestration", "features", "entities", "shared"]);

interface Place {
  layer: Layer;
  /** The src/ folder the path sits in. */
  root: string;
  /** The module's folder, or its file when the module is one file. */
  module: string;
  /** The folder name under the layer, which names an entrypoint. */
  name: string | undefined;
  /** The path inside the module without its extension, empty for the module itself. */
  inside: string;
  /** Whether the module is one file. */
  file: boolean;
}

const isLayer = (value: string | undefined): value is Layer =>
  value !== undefined && Object.hasOwn(allowed, value);

/** Returns where a path sits under src/, or undefined outside the layers. */
function place(path: string): Place | undefined {
  const parts = path.split(sep);
  const src = parts.lastIndexOf("src");
  const layer = parts[src + 1];
  if (src < 0 || !isLayer(layer)) {
    return undefined;
  }
  const depth = modular.has(layer) ? src + 3 : src + 2;
  return {
    layer,
    root: parts.slice(0, src + 1).join(sep),
    module: parts.slice(0, depth).join(sep),
    name: parts[src + 2],
    inside: parts
      .slice(depth)
      .join("/")
      .replace(/\.(js|ts|tsx)$/, ""),
    file: false,
  };
}

/**
 * Returns the src/ folder beside the innermost tests/ folder of a path that has one beside it, or undefined when the
 * path sits in no such tests/ folder.
 */
function testedSource(path: string): string | undefined {
  const parts = path.split(sep);
  for (let tests = parts.length - 2; tests >= 0; tests--) {
    const source = [...parts.slice(0, tests), "src"].join(sep);
    if (parts[tests] === "tests" && existsSync(source)) {
      return source;
    }
  }
  return undefined;
}

/**
 * Returns the file a path names, as TypeScript finds it: as written, then with .ts, .tsx or .js added, where a
 * written .js or .jsx also names the .ts or .tsx file beside it.
 */
function fileAt(path: string): string | undefined {
  const base = path.replace(/\.jsx?$/, "");
  return [path, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  );
}

/**
 * Returns whether the path inside module `to` names a surface: its exports.ts, or an exports.<entrypoint>.ts whose
 * entrypoint, a folder or a file, sits in the module's src/entrypoints.
 */
function isSurface(to: Place): boolean {
  const entrypoint = /^exports\.([^/.][^/]*)$/.exec(to.inside)?.[1];
  if (entrypoint === undefined) {
    return to.inside === "exports";
  }
  const path = join(to.root, "entrypoints", entrypoint);
  return existsSync(path) || fileAt(path) !== undefined;
}

/** Returns why a test's import of module `to` breaks its surface, or undefined when it takes a surface. */
function testProblem(to: Place): string | undefined {
  // A test drives an entrypoint, which has no surface file. A shared or infra module that is one file is its own surface.
  if (to.layer === "entrypoints" || ((to.layer === "shared" || to.layer === "infra") && to.file)) {
    return undefined;
  }
  return isSurface(to)
    ? undefined
    : "A test imports a module only through its exports.ts or exports.<entrypoint>.ts.";
}

/** Returns why a file under src/ may not import module `to`, or undefined when it may. */
function memberProblem(from: Place, to: Place): string | undefined {
  if (to.module === from.module) {
    return undefined;
  }
  const allowedLayers: readonly Layer[] = allowed[from.layer];
  if (!allowedLayers.includes(to.layer)) {
    return `${from.layer} may not import ${to.layer}.`;
  }
  return published.has(to.layer) ? surfaceProblem(from, to) : undefined;
}

/** Returns why an import of module `to` breaks its surface, or undefined when it takes the surface it should. */
function surfaceProblem(from: Place, to: Place): string | undefined {
  // A shared module that is one file is its own surface. A folder, shared or not, is reached through its exports.ts.
  if (to.layer === "shared" && to.file) {
    return undefined;
  }
  if (from.layer !== "entrypoints") {
    return isSurface(to) ? undefined : "Import another module only through its exports.ts.";
  }
  // A module serves one entrypoint through exports.<entrypoint>.ts, and that entrypoint must take it.
  const own =
    from.name !== undefined && existsSync(join(to.module, `exports.${from.name}.ts`))
      ? `exports.${from.name}`
      : "exports";
  return to.inside === own ? undefined : `Import this module through its ${own}.ts.`;
}

type ImportNode =
  | ESTree.ImportDeclaration
  | ESTree.ExportNamedDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ImportExpression;

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Keeps imports inside the layers and behind each module’s surface file" },
  },
  create(context: Context) {
    const from = place(context.filename);
    // A file under src/ is a member of its module, a unit test beside its code included. A test in tests/ belongs to
    // the src/ beside that folder.
    const root = from ? from.root : testedSource(context.filename);
    const check = (node: ImportNode) => {
      const source = node.source;
      if (root === undefined || source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }
      const specifier = source.value;
      // Reads the aliases `@/` and `~/` as `root`, the folder the packages map them to.
      const alias = /^[@~]\//.test(specifier);
      if (!alias && !specifier.startsWith(".")) {
        return;
      }
      const target = alias
        ? join(root, specifier.slice(2))
        : resolve(dirname(context.filename), specifier);
      const to = place(target);
      if (!to) {
        return;
      }
      // An import that names a whole module may name a file module, which TypeScript finds before a folder.
      const file = to.inside === "" ? fileAt(to.module) : undefined;
      if (file) {
        to.module = file;
        to.file = true;
      }
      const problem = from ? memberProblem(from, to) : testProblem(to);
      if (problem) {
        context.report({ node, message: problem });
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default rule;
