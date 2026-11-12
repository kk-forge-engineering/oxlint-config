// An oxlint JS plugin with one rule, `kk-forge/slices`: a file under src/ imports only the layers its own layer may
// take, and reaches another module of orchestration, features or entities only through that module's surface file.
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

// The layers each layer may import. A feature takes no other feature and an orchestration no other orchestration,
// so they link through orchestration and entrypoints. Only entrypoints imports infra, which takes entities and shared.
const allowed = {
  entrypoints: ["entrypoints", "orchestration", "features", "entities", "shared", "infra"],
  orchestration: ["features", "entities", "shared"],
  features: ["entities", "shared"],
  entities: ["entities", "shared"],
  shared: ["shared"],
  infra: ["infra", "entities", "shared"],
};
const modular = new Set(["entrypoints", "orchestration", "features", "entities"]);
const published = new Set(["orchestration", "features", "entities"]);

/** Returns the layer of a path under src/, that src/, the module folder and the path inside it, or undefined. */
function place(path) {
  const parts = path.split(sep);
  const src = parts.lastIndexOf("src");
  const layer = parts[src + 1];
  if (src < 0 || !Object.hasOwn(allowed, layer)) {
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
  };
}

/** Returns why an import of module `to` breaks its surface, or undefined when it takes the surface it should. */
function surfaceProblem(from, to) {
  if (from.layer !== "entrypoints") {
    return /^exports(\.\w+)?$/.test(to.inside)
      ? undefined
      : "Import another module only through its exports.ts.";
  }
  // A module serves one entrypoint through exports.<entrypoint>.ts, and that entrypoint must take it.
  const own = existsSync(join(to.module, `exports.${from.name}.ts`))
    ? `exports.${from.name}`
    : "exports";
  return to.inside === own ? undefined : `Import this module through its ${own}.ts.`;
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Keeps imports inside the layers and behind each module’s surface file" },
  },
  create(context) {
    const from = place(context.filename);
    const check = (node) => {
      const specifier = node.source?.value;
      if (!from || typeof specifier !== "string") {
        return;
      }
      // Reads the aliases `@/` and `~/` as the importing file's src/, the folder the packages map them to.
      const alias = /^[@~]\//.test(specifier);
      if (!alias && !specifier.startsWith(".")) {
        return;
      }
      const target = alias
        ? join(from.root, specifier.slice(2))
        : resolve(dirname(context.filename), specifier);
      const to = place(target);
      if (!to || to.module === from.module) {
        return;
      }
      const problem = !allowed[from.layer].includes(to.layer)
        ? `${from.layer} may not import ${to.layer}.`
        : published.has(to.layer) && surfaceProblem(from, to);
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

export default { meta: { name: "kk-forge" }, rules: { slices: rule } };
