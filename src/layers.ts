// The rule `kk-forge/layers`: a file under src/ imports only the layers its own layer may take, and another module
// only through that module's surface file. A file in the tests/ folder beside src/ may import any layer, through the
// surface file too. An entities module needs two or more importers among features, orchestration and entities modules,
// and an orchestration module imports two or more features.
import { existsSync } from "node:fs";
import { join, sep } from "node:path";

import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

import { moduleProblem } from "./module-counts.js";
import { allowed, fileAt, type Layer, type Place, place, placeOfImport } from "./places.js";

/** The layers whose modules another module reaches only through a surface file. */
const published = new Set<Layer>(["orchestration", "features", "entities", "shared"]);

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
      const to = placeOfImport(root, context.filename, source.value);
      if (!to) {
        return;
      }
      const problem = from ? memberProblem(from, to) : testProblem(to);
      if (problem) {
        context.report({ node, message: problem });
      }
    };
    return {
      Program(node) {
        const problem = from ? moduleProblem(context.filename, from) : undefined;
        if (problem) {
          context.report({ node, message: problem });
        }
      },
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default rule;
