// The oxlint rule `kk-forge/layers`: a file under src/ imports only the layers its layer may take,
// and another module only through its surface file. A test in tests/ beside src/ may import any
// layer, through the surface file too. The rule also checks module importer counts, a feature's
// surface through src/feature-surface.ts, monorepo imports through src/repository.ts, and each
// platform's code through src/platforms.ts.
import { existsSync } from "node:fs";
import { join, sep } from "node:path";

import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

import { surfaceProblems } from "./feature-surface.js";
import { moduleProblem, portEntities } from "./module-counts.js";
import {
  allowed,
  declarationFile,
  fileAt,
  isFeatureInfra,
  isPort,
  type Layer,
  type Place,
  place,
  placeOfImport,
  testFile,
} from "./places.js";
import { innerModuleProblem } from "./package-modules.js";
import { platformProblem } from "./platforms.js";
import { packageProblem, repositoryImport, UnitKind, unitOfRoot } from "./repository.js";

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

/** The layers a feature's infra imports beyond its own feature. */
const featureInfraLayers: readonly Layer[] = ["entities", "infra", "shared"];

/**
 * Returns why a file under src/ may not import the surface of a package for `layer`, or undefined when it may. An app
 * imports each surface as it would its own layer, so only entrypoints, infra and a feature's infra/ import a
 * package's infra.
 */
function packageSurfaceProblem(from: Place, layer: Layer, specifier: string): string | undefined {
  const allowedLayers: readonly Layer[] = isFeatureInfra(from)
    ? featureInfraLayers
    : allowed[from.layer];
  if (allowedLayers.includes(layer)) {
    return undefined;
  }
  const importer = isFeatureInfra(from) ? "A feature's infra" : from.layer;
  return `${importer} may not import ${specifier}, a package's ${layer}.`;
}

/** Returns why a test's import of module `to` breaks its surface, or undefined when it takes a surface. */
function testProblem(to: Place): string | undefined {
  if (isFeatureInfra(to)) {
    return to.inside === "infra/exports"
      ? undefined
      : "Import a feature's infra through its infra/exports.ts.";
  }
  // A test drives an entrypoint, which has no surface file. A shared or infra module that is one file is its own surface.
  if (to.layer === "entrypoints" || ((to.layer === "shared" || to.layer === "infra") && to.file)) {
    return undefined;
  }
  return isSurface(to)
    ? undefined
    : "A test imports a module only through its exports.ts or exports.<entrypoint>.ts.";
}

/**
 * Returns why a file under src/ may not import module `to`, or undefined when it may. A unit test beside its code may
 * also import its feature's infra, as a test in tests/ may.
 */
function memberProblem(from: Place, to: Place, isTest: boolean): string | undefined {
  if (to.module === from.module) {
    return isTest && isFeatureInfra(to) ? undefined : ownModuleProblem(from, to);
  }
  const allowedLayers: readonly Layer[] = isFeatureInfra(from)
    ? featureInfraLayers
    : allowed[from.layer];
  if (!allowedLayers.includes(to.layer)) {
    return isFeatureInfra(from)
      ? `A feature's infra may not import ${to.layer}.`
      : `${from.layer} may not import ${to.layer}.`;
  }
  if (
    isFeatureInfra(from) &&
    to.layer === "entities" &&
    !portEntities(from.module).includes(to.module)
  ) {
    return "A feature's infra imports only the entities its feature's port names.";
  }
  if (isFeatureInfra(to)) {
    if (from.layer !== "entrypoints" || from.inside !== "compose") {
      return "Only the composition root, an entrypoint's compose.ts, imports a feature's infra.";
    }
    return to.inside === "infra/exports"
      ? undefined
      : "Import a feature's infra through its infra/exports.ts.";
  }
  return published.has(to.layer) ? surfaceProblem(from, to) : undefined;
}

/**
 * Returns why a file may not import another file of its own module, or undefined when it may. A feature's infra
 * imports of its feature only the port, and the feature's other code does not import its infra: the composition root
 * passes the adapter in.
 */
function ownModuleProblem(from: Place, to: Place): string | undefined {
  if (isFeatureInfra(from)) {
    return isFeatureInfra(to) || isPort(to)
      ? undefined
      : "A feature's infra imports of its feature only the port.";
  }
  return isFeatureInfra(to)
    ? "A feature does not import its own infra: the composition root passes the adapter in."
    : undefined;
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
    const unit = root === undefined ? undefined : unitOfRoot(root);
    const check = (node: ImportNode) => {
      const source = node.source;
      if (root === undefined || source?.type !== "Literal" || typeof source.value !== "string") {
        return;
      }
      const named = unit ? repositoryImport(unit, context.filename, source.value) : undefined;
      if (named) {
        const problem =
          "problem" in named
            ? named.problem
            : from && packageSurfaceProblem(from, named.layer, named.specifier);
        if (problem) {
          context.report({ node, message: problem });
        }
        return;
      }
      const to = placeOfImport(context.filename, source.value);
      const isTest = testFile.test(context.filename);
      // A test is exempt from the platform checks, since it stands in for each platform with fakes.
      const platform =
        from && !isTest ? platformProblem({ from, specifier: source.value, to }) : undefined;
      if (!to) {
        if (platform) {
          context.report({ node, message: platform });
        }
        return;
      }
      const problem = from
        ? (memberProblem(from, to, isTest) ??
          (unit?.kind === UnitKind.Package
            ? innerModuleProblem({ filename: context.filename, specifier: source.value, to })
            : undefined) ??
          platform)
        : testProblem(to);
      if (problem) {
        context.report({ node, message: problem });
      }
    };
    return {
      Program(node) {
        for (const problem of [
          from ? moduleProblem(context.filename, from) : undefined,
          packageProblem(context.filename),
        ]) {
          if (problem) {
            context.report({ node, message: problem });
          }
        }
        const isCode = !testFile.test(context.filename) && !declarationFile.test(context.filename);
        const surface =
          from && isCode
            ? surfaceProblems({ filename: context.filename, from, text: context.sourceCode.text })
            : [];
        for (const { start, end, message } of surface) {
          const loc = {
            start: context.sourceCode.getLocFromIndex(start),
            end: context.sourceCode.getLocFromIndex(end),
          };
          context.report({ loc, message });
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
