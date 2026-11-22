// The strings a node holds as written, for the rules that match a name exactly and never one an expression computes.
import type { ESTree } from "@oxlint/plugins";

/** Returns the string a string literal, or a template literal without an expression, holds, or undefined. */
export function stringOf(node: ESTree.Node | null | undefined): string | undefined {
  if (node?.type === "Literal") {
    return typeof node.value === "string" ? node.value : undefined;
  }
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/**
 * Returns the key an object property names as written, as `fetch` in `{ fetch }`, `{ "fetch": f }` or
 * `{ ["fetch"]: f }`, or undefined for a key an expression computes and for a spread or a rest element.
 */
export function keyName(property: ESTree.Node): string | undefined {
  if (property.type !== "Property") {
    return undefined;
  }
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  return stringOf(property.key);
}
