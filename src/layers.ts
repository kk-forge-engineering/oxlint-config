// The rule `kk-forge/layers`: a file under src/ imports only the layers its own layer may take, and reaches another
// module only through that module's surface file.
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

const modular = new Set<Layer>(["entrypoints", "orchestration", "features", "entities", "shared"]);
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
 * Returns the file a path names, as TypeScript finds it: as written, then with .ts, .tsx or .js added, where a
 * written .js or .jsx also names the .ts or .tsx file beside it.
 */
function fileAt(path: string): string | undefined {
  const base = path.replace(/\.jsx?$/, "");
  return [path, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  );
}

/** Returns why an import of module `to` breaks its surface, or undefined when it takes the surface it should. */
function surfaceProblem(from: Place, to: Place): string | undefined {
  // A shared module that is one file is its own surface. A folder, shared or not, is reached through its exports.ts.
  if (to.layer === "shared" && to.file) {
    return undefined;
  }
  if (from.layer !== "entrypoints") {
    return /^exports(\.\w+)?$/.test(to.inside)
      ? undefined
      : "Import another module only through its exports.ts.";
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
    const check = (node: ImportNode) => {
      const source = node.source;
      if (!from || source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }
      const specifier = source.value;
      // Reads the aliases `@/` and `~/` as the importing file's src/, the folder the packages map them to.
      const alias = /^[@~]\//.test(specifier);
      if (!alias && !specifier.startsWith(".")) {
        return;
      }
      const target = alias
        ? join(from.root, specifier.slice(2))
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
      if (to.module === from.module) {
        return;
      }
      const allowedLayers: readonly Layer[] = allowed[from.layer];
      const problem = !allowedLayers.includes(to.layer)
        ? `${from.layer} may not import ${to.layer}.`
        : published.has(to.layer)
          ? surfaceProblem(from, to)
          : undefined;
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
