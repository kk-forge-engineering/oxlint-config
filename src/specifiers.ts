// What a specifier must not be, whatever it imports: a tool's alias, a subpath import of the wrong form, or a second
// name for the importing file's own src/, which `#/` names. Each would let an import pass the layer checks unseen.
// Code under src/ also imports nothing from the tests/ beside it, which only tests run.
import { dirname, join, relative, sep } from "node:path";

import { importTarget, isTestKit, place, testFile } from "./places.js";
import { ownSrcProblem, srcSubpathImport, subpathImport } from "./subpath-imports.js";

/**
 * The alias prefixes a tool maps through its own config, such as a bundler's, and the subpath imports of package.json
 * replace. An alias the rule cannot resolve would pass every layer check, so it reports them all.
 */
const toolAliases = ["@@/", "~~/", "@/", "~/"];

/**
 * Returns why a specifier takes another way than `#/` or `#tests/`, or undefined when it does not: a tool's alias, a
 * subpath import of the wrong form, or any other name that resolves into `root`, the src/ the file belongs to, such
 * as a tsconfig.json alias or the app's own name. One that names something else, such as WXT's `#imports`, passes.
 * A file under src/ that is no test or test kit may not import from the tests/ beside it, by `#tests/` or by path.
 */
export function specifierProblem(
  filename: string,
  specifier: string,
  root: string | undefined,
): string | undefined {
  const alias = toolAliases.find((prefix) => specifier.startsWith(prefix));
  if (alias !== undefined) {
    return `Import ${specifier} through ${srcSubpathImport}, not through the alias ${alias}.`;
  }
  const subpath = subpathImport(filename, specifier);
  if (subpath && "problem" in subpath) {
    return subpath.problem;
  }
  const target = subpath ? subpath.target : importTarget(filename, specifier);
  if (root === undefined || target === undefined) {
    return undefined;
  }
  const tests = relative(join(dirname(root), "tests"), target);
  const isCode = place(filename) !== undefined && !testFile.test(filename) && !isTestKit(filename);
  if (isCode && tests !== "" && !tests.startsWith(`..${sep}`) && tests !== "..") {
    return `Code under src/ imports no test helper, so ${specifier} stays with the tests that import it.`;
  }
  return !subpath && !specifier.startsWith(".") && place(target)?.root === root
    ? ownSrcProblem(specifier)
    : undefined;
}
