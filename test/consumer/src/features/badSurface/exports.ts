// This fixture breaks the feature surface rule on purpose. The rule lets a
// feature's surface export only its components, use cases, error classes and
// types. The lint check must report seven of the exports below.
export { createSignal } from "solid-js";
export { trim } from "./trim";
export const limit = 3;
export { BadSurfaceUseCases } from "./useCases";
export { Panel } from "./Panel";
export type { Text } from "./trim";
export { ExpressionError, FromPackageError } from "./errors";
export { SharedError } from "../../shared/errors";
