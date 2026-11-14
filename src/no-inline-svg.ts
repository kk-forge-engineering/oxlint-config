// The rule `kk-forge/no-inline-svg`: JSX writes no SVG markup. An icon lives in its own .svg file, which a component
// imports. The rule reads the element's name exactly: `<svg>`, `<path>`, or any name in the `svg` namespace. A
// component, a member such as `<ns.svg>` and another namespace pass. SVG inside a string is past its reach.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

/** Returns an element's name as written when it is SVG markup, or undefined. */
function inlineSvgName(name: ESTree.JSXElementName): string | undefined {
  if (name.type === "JSXIdentifier" && (name.name === "svg" || name.name === "path")) {
    return name.name;
  }
  if (name.type === "JSXNamespacedName" && name.namespace.name === "svg") {
    return `svg:${name.name.name}`;
  }
  return undefined;
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Forbids SVG markup written in JSX: an icon lives in its own .svg file" },
  },
  create(context: Context) {
    return {
      JSXOpeningElement(element) {
        const name = inlineSvgName(element.name);
        if (name !== undefined) {
          context.report({
            node: element,
            message: `<${name}> is inline SVG. Keep the icon in an .svg file and import it as a component.`,
          });
        }
      },
    };
  },
};

export default rule;
