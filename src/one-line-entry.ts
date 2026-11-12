// The rule `kk-forge/one-line-entry`: a file a framework requires by name holds its imports and one line, which is
// the framework's own definition with one call or a bare call, so the logic stays in code the project names. A project
// turns it on for those files only.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

type Statement = ESTree.Program["body"][number];
type Property = ESTree.ObjectExpression["properties"][number];

const isCall = (node: ESTree.Node | null): node is ESTree.CallExpression =>
  node?.type === "CallExpression";

const isFunction = (node: ESTree.Node): node is ESTree.ArrowFunctionExpression | ESTree.Function =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** Returns the one call a function body holds, as the body itself or as a block's only statement. */
function onlyCall(
  body: ESTree.ArrowFunctionExpression["body"] | ESTree.Function["body"],
): ESTree.CallExpression | undefined {
  if (!body) {
    return undefined;
  }
  if (body.type !== "BlockStatement") {
    return isCall(body) ? body : undefined;
  }
  const [only, ...rest] = body.body;
  return rest.length === 0 && only?.type === "ExpressionStatement" && isCall(only.expression)
    ? only.expression
    : undefined;
}

/** Returns whether a value is a literal, a template without expressions, or an array or object built of them. */
function isLiteralValue(node: ESTree.ArrayExpression["elements"][number]): boolean {
  if (node?.type === "Literal") {
    return !("regex" in node) && typeof node.value !== "bigint";
  }
  if (node?.type === "TemplateLiteral") {
    return node.expressions.length === 0;
  }
  if (node?.type === "ArrayExpression") {
    return node.elements.every(isLiteralValue);
  }
  return node?.type === "ObjectExpression" && node.properties.every(isOption);
}

/** Returns whether a property is a plain `key: value` whose value is a literal value. */
const isOption = (property: Property): boolean =>
  property.type === "Property" &&
  !property.computed &&
  property.kind === "init" &&
  !property.method &&
  isLiteralValue(property.value);

/** Returns whether a property is a function, by arrow, method or `function`, that passes its parameters to one call. */
function isMain(property: Property): boolean {
  if (
    property.type !== "Property" ||
    property.computed ||
    property.kind !== "init" ||
    !isFunction(property.value)
  ) {
    return false;
  }
  const call = onlyCall(property.value.body);
  return (
    property.value.params.every((param) => param.type === "Identifier") &&
    call?.callee.type === "Identifier" &&
    call.arguments.every(
      (argument) => argument.type === "Identifier" || argument.type === "Literal",
    )
  );
}

/** Returns whether a definition's options are literal values beside exactly one function, `main`. */
function isDefinitionOptions(options: ESTree.ObjectExpression): boolean {
  const [main, ...rest] = options.properties.filter((property) => !isOption(property));
  return main !== undefined && rest.length === 0 && isMain(main);
}

/**
 * Returns whether a statement is the one line: a framework definition around an arrow or an options object, or a bare
 * call. A bare call may stand under `void` or `await`, so a call that returns a promise is not left floating.
 */
function isEntryLine(statement: Statement): boolean {
  if (statement.type === "ExportDefaultDeclaration") {
    const definition = statement.declaration;
    if (
      !isCall(definition) ||
      definition.callee.type !== "Identifier" ||
      definition.arguments.length !== 1
    ) {
      return false;
    }
    const [argument] = definition.arguments;
    return argument?.type === "ArrowFunctionExpression"
      ? onlyCall(argument.body) !== undefined
      : argument?.type === "ObjectExpression" && isDefinitionOptions(argument);
  }
  if (statement.type !== "ExpressionStatement") {
    return false;
  }
  const expression = statement.expression;
  const unwrapped =
    (expression.type === "UnaryExpression" && expression.operator === "void") ||
    expression.type === "AwaitExpression"
      ? expression.argument
      : expression;
  return isCall(unwrapped);
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Keeps a file a framework requires by name to its imports and one line" },
  },
  create(context: Context) {
    return {
      Program(program) {
        const [line, extra] = program.body.filter(
          (statement) => statement.type !== "ImportDeclaration",
        );
        const offending = !line ? program : !isEntryLine(line) ? line : extra;
        if (offending) {
          context.report({
            node: offending,
            message:
              "A framework entry file is one line. Put its logic in the start…() or mount…() it calls.",
          });
        }
      },
    };
  },
};

export default rule;
