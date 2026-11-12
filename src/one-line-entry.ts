// The rule `kk-forge/one-line-entry`: a file a framework requires by name holds its imports and one line, which is
// the framework's own definition with one call or a bare call, so the logic stays in code the project names. A project
// turns it on for those files only.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

type Statement = ESTree.Program["body"][number];
type Property = ESTree.ObjectExpression["properties"][number];
type Callable = ESTree.ArrowFunctionExpression | ESTree.Function;

const isFunction = (node: ESTree.Node): node is Callable =>
  node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression";

/** Returns whether an argument is an identifier, a literal, or a chain of plain property reads such as `ctx.signal`. */
function isPlainArgument(node: ESTree.CallExpression["arguments"][number]): boolean {
  if (node.type === "MemberExpression") {
    return !node.computed && isPlainArgument(node.object);
  }
  return node.type === "Identifier" || node.type === "Literal";
}

/**
 * Returns whether an expression is one call of a named function on plain arguments. The call may stand under `void`
 * or `await`, so a call that returns a promise is not left floating.
 */
function isOneCall(node: ESTree.Expression): boolean {
  const call =
    (node.type === "UnaryExpression" && node.operator === "void") || node.type === "AwaitExpression"
      ? node.argument
      : node;
  return (
    call.type === "CallExpression" &&
    call.callee.type === "Identifier" &&
    call.arguments.every(isPlainArgument)
  );
}

/** Returns whether a function takes plain parameters and its body is one call, as the body or its only statement. */
function isOneCallFunction(callable: Callable): boolean {
  const body = callable.body;
  if (
    callable.generator ||
    !callable.params.every((param) => param.type === "Identifier") ||
    !body
  ) {
    return false;
  }
  if (body.type !== "BlockStatement") {
    return isOneCall(body);
  }
  const [only, ...rest] = body.body;
  return rest.length === 0 && only?.type === "ExpressionStatement" && isOneCall(only.expression);
}

/** Returns whether a value is a literal, a negative number, a template without expressions, or an array or object of them. */
function isLiteralValue(node: ESTree.ArrayExpression["elements"][number]): boolean {
  if (node?.type === "Literal") {
    return !("regex" in node) && typeof node.value !== "bigint";
  }
  if (node?.type === "UnaryExpression") {
    return (
      node.operator === "-" &&
      node.argument.type === "Literal" &&
      typeof node.argument.value === "number"
    );
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

/** Returns whether a definition's options are literal values beside exactly one function, `main`, of one call. */
function isDefinitionOptions(options: ESTree.ObjectExpression): boolean {
  const [main, ...rest] = options.properties.filter((property) => !isOption(property));
  return (
    rest.length === 0 &&
    main?.type === "Property" &&
    !main.computed &&
    main.kind === "init" &&
    isFunction(main.value) &&
    isOneCallFunction(main.value)
  );
}

/** Returns whether a statement is the one line: a framework definition around an arrow or an options object, or a bare call. */
function isEntryLine(statement: Statement): boolean {
  if (statement.type === "ExpressionStatement") {
    return isOneCall(statement.expression);
  }
  if (statement.type !== "ExportDefaultDeclaration") {
    return false;
  }
  const definition = statement.declaration;
  if (
    definition.type !== "CallExpression" ||
    definition.callee.type !== "Identifier" ||
    definition.arguments.length !== 1
  ) {
    return false;
  }
  const [argument] = definition.arguments;
  if (argument?.type === "ArrowFunctionExpression") {
    return isOneCallFunction(argument);
  }
  return argument?.type === "ObjectExpression" && isDefinitionOptions(argument);
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
