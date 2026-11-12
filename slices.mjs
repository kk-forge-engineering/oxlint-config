// An oxlint JS plugin with one rule, `kk-forge/slices`: a file under src/ imports only the layers its own layer may
// take, and reaches another module of orchestration, features or entities only through that module's exports.ts.
import { dirname, resolve, sep } from "node:path";

// The layers each layer may import. Only entrypoints imports infra, and infra takes entities and shared.
const allowed = {
  entrypoints: ["entrypoints", "orchestration", "features", "entities", "shared", "infra"],
  orchestration: ["orchestration", "features", "entities", "shared"],
  features: ["features", "entities", "shared"],
  entities: ["entities", "shared"],
  shared: ["shared"],
  infra: ["infra", "entities", "shared"],
};
const modular = new Set(["entrypoints", "orchestration", "features", "entities"]);
const published = new Set(["orchestration", "features", "entities"]);

/** Returns the layer of a path under src/, its module folder and its path inside that module, or undefined. */
function place(path) {
  const parts = path.split(sep);
  const src = parts.lastIndexOf("src");
  const layer = parts[src + 1];
  if (src < 0 || !Object.hasOwn(allowed, layer)) {
    return undefined;
  }
  const depth = modular.has(layer) ? src + 3 : src + 2;
  return { layer, module: parts.slice(0, depth).join(sep), inside: parts.slice(depth).join("/") };
}

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Keeps imports inside the layers and behind each module’s exports.ts" },
  },
  create(context) {
    const from = place(context.filename);
    const check = (node) => {
      const specifier = node.source?.value;
      if (!from || typeof specifier !== "string" || !specifier.startsWith(".")) {
        return;
      }
      const to = place(resolve(dirname(context.filename), specifier));
      if (!to || to.module === from.module) {
        return;
      }
      if (!allowed[from.layer].includes(to.layer)) {
        context.report({ node, message: `${from.layer} may not import ${to.layer}.` });
      } else if (published.has(to.layer) && to.inside.replace(/\.(js|ts|tsx)$/, "") !== "exports") {
        context.report({ node, message: "Import another module only through its exports.ts." });
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
