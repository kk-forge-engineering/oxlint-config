import { ExternalError } from "external-errors";

// The check cannot follow either parent to Error: one is a package's class, the other an expression.
export class FromPackageError extends ExternalError {}

const withCode = (base: typeof Error): typeof Error => base;

export class ExpressionError extends withCode(Error) {}
