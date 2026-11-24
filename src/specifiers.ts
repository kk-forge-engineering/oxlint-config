// What a specifier must not be, whatever it imports: a tool's alias, a subpath import of the wrong form, or a second
// name for the importing file's own src/, which `#src/` names. Each would let an import pass the layer checks unseen.
// Code under src/ also imports nothing from the tests/ beside it, which only tests run.
import { isAbsolute, join, relative, sep } from "node:path";

import { importTarget, isTestKit, place, testFile } from "./places.js";
import { ownSrcProblem, packageRoot, srcSubpathImport, subpathImport } from "./subpath-imports.js";

/**
 * The alias prefixes a tool maps through its own config, such as a bundler's, and the subpath imports of package.json
 * replace. An alias the rule cannot resolve would pass every layer check, so it reports them all.
 */
const toolAliases = ["@@/", "~~/", "@/", "~/"];

/** Returns whether `path` sits in `dir`, or is `dir` itself. */
function isInside(dir: string, path: string): boolean {
  const rest = relative(dir, path);
  return rest !== ".." && !rest.startsWith(`..${sep}`) && !isAbsolute(rest);
}

/**
 * Returns whether a file in the src/ of its package that is no test or test kit imports a test helper: through
 * `#tests/`, or by a path into the tests/ beside that src/. The package is the nearest package.json's folder, so a
 * checkout under a folder named src is no src/ of its own. A file outside the layers, such as `src/app.tsx`, counts.
 */
function importsTests(filename: string, specifier: string, target: string | undefined): boolean {
  const root = packageRoot(filename);
  if (
    root === undefined ||
    !isInside(join(root, "src"), filename) ||
    testFile.test(filename) ||
    isTestKit(filename)
  ) {
    return false;
  }
  return (
    specifier.startsWith("#tests/") ||
    (target !== undefined && isInside(join(root, "tests"), target))
  );
}

/**
 * Returns why a specifier takes another way than `#src/` or `#tests/`, or undefined when it does not: a tool's alias, a
 * subpath import of the wrong form, or any other name that resolves into `root`, the src/ the file belongs to, such
 * as a tsconfig.json alias or the app's own name. A `#` name fails unless it is `#src/`, `#tests/` or one `isSdk` takes,
 * such as WXT's `#imports`.
 * A file under src/ that is no test or test kit may not import from the tests/ beside it, by `#tests/` or by path.
 */
export function specifierProblem(
  filename: string,
  specifier: string,
  root: string | undefined,
  isSdk: (specifier: string) => boolean,
): string | undefined {
  const alias = toolAliases.find((prefix) => specifier.startsWith(prefix));
  if (alias !== undefined) {
    return `Import ${specifier} through ${srcSubpathImport}, not through the alias ${alias}.`;
  }
  const subpath = subpathImport(filename, specifier);
  if (subpath && "problem" in subpath) {
    return subpath.problem;
  }
  const target = importTarget(filename, specifier);
  // The layers read a `#` name only as `#src/`, `#tests/` or a platform's SDK, which its tool generates. Any other, a
  // `#/` left from the old key or a tsconfig.json `paths` alias, would hide where the import goes.
  if (specifier.startsWith("#") && !subpath && !isSdk(specifier)) {
    return `Import ${specifier} through #src/ or #tests/: the layers read no other # name but a platform's SDK, so a file outside src/ and tests/ goes through a relative path or a package.`;
  }
  if (importsTests(filename, specifier, target)) {
    return `Code under src/ imports no test helper, so ${specifier} stays with the tests that import it.`;
  }
  if (root === undefined || target === undefined) {
    return undefined;
  }
  return !subpath && !specifier.startsWith(".") && place(target)?.root === root
    ? ownSrcProblem(specifier)
    : undefined;
}
