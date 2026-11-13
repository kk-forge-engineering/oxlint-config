// The rule `kk-forge/no-conditional-map`: a `.map()` list in JSX children under a condition, such as `{open && rows.map(…)}`,
// fails. Solid reruns that expression on any change to the list and builds every row again, so a row loses its input
// text and focus. eslint-plugin-solid's prefer-for reports only a `.map()` that is the whole expression.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

/** Returns each `.map()` call that a branch of a condition, `&&`, `||`, `??` or `? :`, yields from an expression. */
function conditionalMaps(node: ESTree.Node, isBranch: boolean): ESTree.CallExpression[] {
  if (node.type === "ChainExpression") {
    return conditionalMaps(node.expression, isBranch);
  }
  if (node.type === "LogicalExpression") {
    return [...conditionalMaps(node.left, true), ...conditionalMaps(node.right, true)];
  }
  if (node.type === "ConditionalExpression") {
    return [...conditionalMaps(node.consequent, true), ...conditionalMaps(node.alternate, true)];
  }
  const isMap =
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "map";
  return isBranch && isMap ? [node] : [];
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbids a .map() list of JSX nodes under a condition, which Solid rebuilds whole",
    },
  },
  create(context: Context) {
    return {
      JSXExpressionContainer(container) {
        if (container.parent.type !== "JSXElement" && container.parent.type !== "JSXFragment") {
          return;
        }
        for (const call of conditionalMaps(container.expression, false)) {
          context.report({
            node: call,
            message:
              "Solid rebuilds every row of a .map() list under a condition. Render the list with <For> inside <Show>.",
          });
        }
      },
    };
  },
};

export default rule;
