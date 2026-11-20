// What a name refers to in the scope a reference resolves in, for the rules that tell a global from a local of its name.
import type { Context, ESTree, Scope } from "@oxlint/plugins";

/** Returns the reference an identifier makes, or undefined when it makes none, as a property name does. */
export function referenceOf(context: Context, node: ESTree.Node) {
  for (let scope: Scope | null = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const reference = scope.references.find((candidate) => candidate.identifier === node);
    if (reference) {
      return reference;
    }
  }
  return undefined;
}

/**
 * Returns whether an identifier is a reference that resolves to a global: a built-in the linter declares, or a name
 * no scope declares, such as `setTimeout` or `process`. A parameter, an import or a local of that name is no global.
 */
export const isGlobal = (context: Context, node: ESTree.Node): boolean =>
  context.sourceCode.isGlobalReference(node) || referenceOf(context, node)?.resolved === null;
