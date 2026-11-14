// Where a path sits in the layers of an app's src/ folder, and which module an import names.
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Maps each layer to the layers it may import. Features link only through orchestration and entrypoints, and
 * orchestrations through entrypoints.
 */
export const allowed = {
  entrypoints: ["entrypoints", "orchestration", "features", "entities", "shared", "infra"],
  orchestration: ["features", "entities", "shared"],
  features: ["entities", "shared"],
  entities: ["entities", "shared"],
  shared: ["shared"],
  infra: ["infra", "entities", "shared"],
} as const satisfies Record<string, readonly string[]>;
export type Layer = keyof typeof allowed;

export interface Place {
  layer: Layer;
  /** The src/ folder the path sits in. */
  root: string;
  /** The module's folder, or its file when the module is one file. */
  module: string;
  /**
   * The folder or file name under the layer without its extension, or undefined for the layer folder itself. It names
   * an entrypoint.
   */
  name: string | undefined;
  /** The path inside the module with "/" separators and without its extension, or empty for the module itself. */
  inside: string;
  /** Whether the module is one file. */
  file: boolean;
}

const isLayer = (value: string | undefined): value is Layer =>
  value !== undefined && Object.hasOwn(allowed, value);

/** Returns where a path sits under src/, or undefined outside the layers. */
export function place(path: string): Place | undefined {
  const parts = path.split(sep);
  const src = parts.lastIndexOf("src");
  const layer = parts[src + 1];
  if (src < 0 || !isLayer(layer)) {
    return undefined;
  }
  // A module is the folder or file directly under its layer.
  const depth = src + 3;
  return {
    layer,
    root: parts.slice(0, src + 1).join(sep),
    module: parts.slice(0, depth).join(sep),
    name: parts.length === src + 3 ? parts[src + 2]?.replace(/\.[^.]*$/, "") : parts[src + 2],
    inside: parts
      .slice(depth)
      .join("/")
      .replace(/\.(js|ts|tsx)$/, ""),
    file: false,
  };
}

/**
 * Returns the file a path names, or undefined. Like TypeScript, it tries the path as written, then with .ts, .tsx or
 * .js in place of any .js or .jsx.
 */
export function fileAt(path: string): string | undefined {
  const base = path.replace(/\.jsx?$/, "");
  return [path, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(
    (file) => existsSync(file) && statSync(file).isFile(),
  );
}

/**
 * Returns the module a specifier names from `filename`, or undefined outside the layers. It reads `@/` and `~/` as
 * `root`, the src/ folder they alias.
 */
export function placeOfImport(
  root: string,
  filename: string,
  specifier: string,
): Place | undefined {
  const alias = /^[@~]\//.test(specifier);
  if (!alias && !specifier.startsWith(".")) {
    return undefined;
  }
  const to = place(alias ? join(root, specifier.slice(2)) : resolve(dirname(filename), specifier));
  if (!to) {
    return undefined;
  }
  // An import of a whole module may name a one-file module. TypeScript takes the file before a folder of the same name.
  const file = to.inside === "" ? fileAt(to.module) : undefined;
  if (file) {
    to.module = file;
    to.file = true;
  }
  return to;
}
