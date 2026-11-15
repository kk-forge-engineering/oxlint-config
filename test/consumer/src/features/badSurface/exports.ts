// A feature's surface gives out its components, its use cases, its error classes and types, so seven of these exports
// break it.
export { createSignal } from "solid-js";
export { trim } from "./trim";
export const limit = 3;
export { BadSurfaceUseCases } from "./useCases";
export { Panel } from "./Panel";
export type { Text } from "./trim";
export { ExpressionError, FromPackageError } from "./errors";
export { SharedError } from "../../shared/errors";
