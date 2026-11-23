// What a specifier must not be, whatever it imports: a tool's alias, a subpath import of the wrong form, or a second
// name for the importing file's own src/, which `#/` names. Each would let an import pass the layer checks unseen.
import { importTarget, place } from "./places.js";
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
  if (subpath) {
    return "problem" in subpath ? subpath.problem : undefined;
  }
  const target = specifier.startsWith(".") ? undefined : importTarget(filename, specifier);
  return root !== undefined && target !== undefined && place(target)?.root === root
    ? ownSrcProblem(specifier)
    : undefined;
}
