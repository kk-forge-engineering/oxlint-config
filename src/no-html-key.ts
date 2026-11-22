// The rule `kk-forge/no-html-key`: code names no `innerHTML` or `outerHTML` key that sets the property without reading
// it, which `no-restricted-properties` and `solid/no-innerhtml` miss. That is a key of an object literal, as in
// `Object.assign(node, { innerHTML: text })` or `<div {...{ innerHTML: text }} />`, and the key `Reflect.set` takes.
// The rule reads the key as written: a name, a string, or a template without an expression. A key computed from a
// variable, such as `[key]`, passes. A destructuring pattern reads the property, which `no-restricted-properties` reports.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

import { keyName, stringOf } from "./literals.js";
import { isGlobal } from "./scope.js";

// Solid's spread writes a `prop:` key straight to the node's property.
const htmlKeys = new Set(["innerHTML", "outerHTML", "prop:innerHTML", "prop:outerHTML"]);

/** Tells whether a call is `Reflect.set` on the global `Reflect`. */
function isReflectSet(context: Context, call: ESTree.CallExpression): boolean {
  const callee = call.callee;
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    callee.property.name === "set" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Reflect" &&
    isGlobal(context, callee.object)
  );
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbids an innerHTML or outerHTML key that sets HTML from a string without reading the property",
    },
  },
  create(context: Context) {
    const report = (node: ESTree.Node, name: string | undefined): void => {
      if (name !== undefined && htmlKeys.has(name)) {
        context.report({
          node,
          message: `The key ${name} sets HTML from a string, which the page would run. Build the nodes instead.`,
        });
      }
    };
    return {
      ObjectExpression(object) {
        for (const property of object.properties) {
          report(property, keyName(property));
        }
      },
      CallExpression(call) {
        const key = call.arguments[1];
        if (key !== undefined && isReflectSet(context, call)) {
          report(key, stringOf(key));
        }
      },
    };
  },
};

export default rule;
