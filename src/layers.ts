// The oxlint rule `kk-forge/layers`: a file under src/ imports only the layers its layer may take,
// and another module only through its surface file. A test in tests/ beside src/ may import any
// layer, through the surface file too. The rule also checks module importer counts, a feature's
// surface through src/feature-surface.ts, monorepo imports through src/repository.ts, and each
// platform's code through src/platforms.ts.
import { existsSync } from "node:fs";
import { join, sep } from "node:path";

import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

import { surfaceProblems } from "./feature-surface.js";
import { stringOf } from "./literals.js";
import { moduleProblem, portEntities } from "./module-counts.js";
import {
  allowed,
  declarationFile,
  fileAt,
  isFeatureInfra,
  isPort,
  isTestKit,
  type Layer,
  type Place,
  place,
  placeOfImport,
  testFile,
} from "./places.js";
import { innerModuleProblem } from "./package-modules.js";
import { newPlatformChecks, type Platform, type PlatformImport, platforms } from "./platforms.js";
import { isGlobal } from "./scope.js";
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

/** Returns the name an import or export specifier gives, from an identifier or a string. */
const nameOf = (node: ESTree.Node): string | undefined =>
  node.type === "Identifier" ? node.name : stringOf(node);

/**
 * Returns the names an import or re-export takes from its module, or undefined when it takes the whole module, as a
 * default, namespace, side-effect or dynamic import and `export *` do.
 */
function importedNames(node: ImportNode): string[] | undefined {
  if (node.type === "ImportDeclaration") {
    const names = node.specifiers.map((specifier) =>
      specifier.type === "ImportSpecifier" ? nameOf(specifier.imported) : undefined,
    );
    return names.length > 0 && names.every((name) => name !== undefined) ? names : undefined;
  }
  if (node.type === "ExportNamedDeclaration") {
    const names = node.specifiers.map((specifier) => nameOf(specifier.local));
    return names.length > 0 && names.every((name) => name !== undefined) ? names : undefined;
  }
  return undefined;
}

/** Returns the name a type such as `import("x").Name` or `import("x").Name.Inner` takes from its module. */
function importTypeName(node: ESTree.TSImportType): string[] | undefined {
  let qualifier: ESTree.Node | null = node.qualifier;
  while (qualifier?.type === "TSQualifiedName") {
    qualifier = qualifier.left;
  }
  return qualifier?.type === "Identifier" ? [qualifier.name] : undefined;
}

/** Builds the rule over a list of platforms, the preset's own unless a test adds one. */
export function newLayersRule(list: readonly Platform[] = platforms): CreateRule {
  const checks = newPlatformChecks(list);
  return {
    meta: {
      type: "problem",
      docs: {
        description: "Keeps imports inside the layers and behind each module’s surface file",
      },
    },
    create(context: Context) {
      const from = place(context.filename);
      // A file under src/ is a member of its module, a unit test beside its code included. A test in tests/ belongs to
      // the src/ beside that folder.
      const root = from ? from.root : testedSource(context.filename);
      const unit = root === undefined ? undefined : unitOfRoot(root);
      // A test and a test kit are exempt from the platform checks, since they stand in for each platform with fakes.
      const platformFrom =
        from && !testFile.test(context.filename) && !isTestKit(context.filename) ? from : undefined;
      /** The file's imports the platform checks read, as the editor shows them, with the node each reports on. */
      const platformImports: (PlatformImport & { node: ESTree.Node })[] = [];
      /** The imports that got a report already, which the entrypoint's platform check passes over. */
      const reported = new Set<ESTree.Node>();
      const report = (node: ESTree.Node, message: string) => {
        reported.add(node);
        context.report({ node, message });
      };
      /** Checks a type import or a `require` only for platforms: the layer checks read the static imports. */
      const checkPlatform = (
        node: ESTree.Node,
        specifier: string | undefined,
        names?: readonly string[],
      ) => {
        if (platformFrom === undefined || specifier === undefined) {
          return;
        }
        const to = placeOfImport(context.filename, specifier);
        const named = unit ? repositoryImport(unit, context.filename, specifier) : undefined;
        const entry = { node, specifier, to, packageAdapter: checks.packageAdapterOf(named) };
        platformImports.push(entry);
        const problem = checks.platformProblem({ ...entry, from: platformFrom, names });
        if (problem) {
          report(node, problem);
        }
      };
      const check = (node: ImportNode) => {
        const specifier = stringOf(node.source);
        if (root === undefined || specifier === undefined) {
          return;
        }
        const named = unit ? repositoryImport(unit, context.filename, specifier) : undefined;
        if (named) {
          if ("problem" in named) {
            report(node, named.problem);
            return;
          }
          const packageAdapter = checks.packageAdapterOf(named);
          const entry = { node, specifier, to: undefined, packageAdapter };
          if (packageAdapter && platformFrom) {
            platformImports.push(entry);
          }
          const surface = packageAdapter
            ? `${named.surface}/${packageAdapter.adapter}`
            : named.surface;
          const problem =
            (from && packageSurfaceProblem(from, named.layer, specifier)) ??
            (named.rest !== "" && specifier !== surface
              ? `Import ${specifier} through the package's ${named.layer} surface, ${surface}.`
              : undefined) ??
            (packageAdapter &&
              platformFrom &&
              checks.platformProblem({ ...entry, from: platformFrom, names: importedNames(node) }));
          if (problem) {
            report(node, problem);
          }
          return;
        }
        const to = placeOfImport(context.filename, specifier);
        if (platformFrom) {
          platformImports.push({ node, specifier, to });
        }
        const platform =
          platformFrom &&
          checks.platformProblem({ from: platformFrom, specifier, to, names: importedNames(node) });
        const problem = !to
          ? platform
          : from
            ? (memberProblem(from, to, testFile.test(context.filename)) ??
              (unit?.kind === UnitKind.Package
                ? innerModuleProblem({ filename: context.filename, specifier, to })
                : undefined) ??
              platform)
            : testProblem(to);
        if (problem) {
          report(node, problem);
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
          const isCode =
            !testFile.test(context.filename) && !declarationFile.test(context.filename);
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
        // `import("sdk").Type` in a type.
        TSImportType(node) {
          checkPlatform(node, stringOf(node.source), importTypeName(node));
        },
        // `import api = require("sdk")`.
        TSImportEqualsDeclaration(node) {
          if (node.moduleReference.type === "TSExternalModuleReference") {
            checkPlatform(node, stringOf(node.moduleReference.expression));
          }
        },
        // `require("sdk")`, where `require` is the global and no local of its name.
        CallExpression(node) {
          const [argument] = node.arguments;
          if (
            node.callee.type === "Identifier" &&
            node.callee.name === "require" &&
            node.arguments.length === 1 &&
            argument !== undefined &&
            isGlobal(context, node.callee)
          ) {
            checkPlatform(node, stringOf(argument));
          }
        },
        // An entrypoint's platforms take in every import of the file, so the check runs once the file is read.
        "Program:exit"() {
          if (platformFrom === undefined) {
            return;
          }
          const problems = checks.entrypointPlatformProblems({
            filename: context.filename,
            from: platformFrom,
            imports: platformImports,
          });
          platformImports.forEach(({ node }, index) => {
            const problem = problems[index];
            if (problem && !reported.has(node)) {
              report(node, problem);
            }
          });
        },
      };
    },
  };
}

export default newLayersRule();
