// The part of `kk-forge/layers` that checks a feature's surface: it gives out only its components, its use cases class
// and factory, its error classes and types. A component declares its return type `JSX.Element`. The use cases take
// their names from the feature's folder. The check follows each exported name to its declaration.
import { basename, dirname, join } from "node:path";

import type { Class, Declaration, ParamPattern } from "oxc-parser";

import { exportsOf, isDeclaration, type Kind, programOf } from "./exported-names.js";
import type { Place } from "./places.js";

/** A problem the check reports, by the offsets of the export it reports on. */
export interface SurfaceProblem {
  start: number;
  end: number;
  message: string;
}

/**
 * Returns a name with each word upper-cased at its start, the words split at `.` and `-`: `overlay.content` gives
 * `OverlayContent`.
 */
const pascal = (name: string): string =>
  name
    .split(/[.-]/)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");

/** The use cases of one surface: the file, the class, its factory and its options type. */
interface UseCasesNames {
  file: string;
  useCases: string;
  factory: string;
  options: string;
}

/**
 * Returns the use cases' names of a feature module's surface, from the module's folder name and the surface's runtime:
 * `textsUseCases.ts` and `TextsUseCases` for `exports.ts`, and `convertUseCases.serviceWorker.ts` and
 * `ConvertServiceWorkerUseCases` for the `exports.serviceWorker.ts` of `convert`.
 */
function useCasesNames(module: string, runtime: string | undefined): UseCasesNames {
  const feature = basename(module);
  const type = `${pascal(feature)}${runtime === undefined ? "" : pascal(runtime)}UseCases`;
  return {
    file: join(module, `${feature}UseCases${runtime === undefined ? "" : `.${runtime}`}.ts`),
    useCases: type,
    factory: `new${type}`,
    options: `${type}Options`,
  };
}

/**
 * Returns what follows `<prefix>.` in a path inside a module, undefined for the prefix itself, and null for a path that
 * is neither: for `exports.background` and the prefix `exports`, `background`.
 */
function runtimeAfter(inside: string, prefix: string): string | undefined | null {
  if (inside === prefix) {
    return undefined;
  }
  const runtime = inside.startsWith(`${prefix}.`) ? inside.slice(prefix.length + 1) : "";
  return runtime === "" || runtime.includes("/") ? null : runtime;
}

const what: Record<Kind, string> = {
  type: "a type",
  component: "a component",
  error: "an error class",
  class: "a class",
  function: "a free function",
  value: "a value",
};

/**
 * Returns one problem for each name a surface file of a feature exports that
 * breaks the surface.
 */
function exportProblems({
  filename,
  names,
  from,
  text,
}: {
  filename: string;
  names: UseCasesNames;
  from: Place;
  text: string;
}): SurfaceProblem[] {
  const feature = `features/${basename(from.module)}`;
  const gives = `the surface of ${feature} gives out only its components, ${names.useCases}, its error classes and types`;
  const exported = exportsOf({ file: filename, text, feature: from.module });
  return exported.flatMap(({ name, start, end, declared }): SurfaceProblem[] => {
    if (declared === undefined) {
      return [
        {
          start,
          end,
          message: `The check cannot read the declaration of ${name}, such as one in a package, and ${gives}.`,
        },
      ];
    }
    // An error class is part of the feature's contract, which a caller matches with instanceof.
    if (declared.kind === "type" || declared.kind === "component" || declared.kind === "error") {
      return [];
    }
    const isUseCases =
      (name === names.useCases && declared.kind === "class") ||
      (name === names.factory && declared.kind === "function");
    if (isUseCases) {
      return declared.file === names.file
        ? []
        : [{ start, end, message: `${name} goes in ${feature}/${basename(names.file)}.` }];
    }
    const instead =
      declared.kind === "class"
        ? `make it ${names.useCases}, an error class that extends Error or another error class of the feature, ` +
          "or keep it inside the feature."
        : `make it a method of ${names.useCases}, or a component that declares its return type JSX.Element, or ` +
          "keep it inside the feature.";
    return [{ start, end, message: `${name} is ${what[declared.kind]}, and ${gives}: ${instead}` }];
  });
}

/** Returns whether a parameter is one object typed by the options, as in `{ ...deps }: TextsUseCasesOptions`. */
function takesOptions(params: ParamPattern[], options: string): boolean {
  const [param] = params;
  if (params.length !== 1 || param === undefined || param.type === "TSParameterProperty") {
    return false;
  }
  const type = param.type === "RestElement" ? undefined : param.typeAnnotation?.typeAnnotation;
  return (
    type?.type === "TSTypeReference" &&
    type.typeName.type === "Identifier" &&
    type.typeName.name === options
  );
}

/**
 * Returns whether a constructor takes the options as one destructured object,
 * as in
 * `{ retries, ...deps }: TextsUseCasesOptions`.
 */
const destructuresOptions = (params: ParamPattern[], options: string): boolean =>
  takesOptions(params, options) && params[0]?.type === "ObjectPattern";

/**
 * Returns the parameters of the constructor a class runs, or undefined when it declares no constructor with a body,
 * as when it lists only signatures.
 */
function constructorParams(declaration: Class): ParamPattern[] | undefined {
  for (const member of declaration.body.body) {
    // An overloaded constructor lists its signatures first.
    if (
      member.type === "MethodDefinition" &&
      member.kind === "constructor" &&
      member.value.body !== null
    ) {
      return member.value.params;
    }
  }
  return undefined;
}

/** Returns the parameters of a function a declarator holds, as in `const newX = (options: XOptions) => …`. */
function functionParams(declaration: Declaration, name: string): ParamPattern[] | undefined {
  // An overload's signature is a TSDeclareFunction, which takes the same options.
  if (declaration.type === "FunctionDeclaration" || declaration.type === "TSDeclareFunction") {
    return declaration.id?.name === name ? declaration.params : undefined;
  }
  if (declaration.type !== "VariableDeclaration") {
    return undefined;
  }
  for (const { id, init } of declaration.declarations) {
    if (
      id.type === "Identifier" &&
      id.name === name &&
      (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression")
    ) {
      return init.params;
    }
  }
  return undefined;
}

/**
 * Returns why the use cases file of a feature breaks its shape: the class and its factory each take the options, and
 * the file exports no other value.
 */
function useCasesProblems(names: UseCasesNames, text: string): SurfaceProblem[] {
  const file = basename(names.file);
  const problems: SurfaceProblem[] = [];
  let hasClass = false;
  let hasFactory = false;
  for (const statement of programOf(names.file, text).body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration === null || !isDeclaration(declaration)) {
      continue;
    }
    const at = { start: statement.start, end: statement.end };
    if (declaration.type === "ClassDeclaration" && declaration.id?.name === names.useCases) {
      hasClass = true;
      if (!destructuresOptions(constructorParams(declaration) ?? [], names.options)) {
        problems.push({
          ...at,
          message: `${names.useCases} takes its options in its constructor: constructor({ ...deps }: ${names.options}).`,
        });
      }
      continue;
    }
    const factoryParams = functionParams(declaration, names.factory);
    if (factoryParams !== undefined) {
      hasFactory = true;
      if (!takesOptions(factoryParams, names.options)) {
        problems.push({
          ...at,
          message: `${names.factory} takes the options: ${names.factory}(options: ${names.options}).`,
        });
      }
    }
  }
  // Every export form counts, a re-export and `export { helper }` included, so the file's exports come from exportsOf.
  const exported = exportsOf({ file: names.file, text, feature: dirname(names.file) });
  for (const { name, start, end, declared } of exported) {
    if (name !== names.useCases && name !== names.factory && declared?.kind !== "type") {
      problems.push({
        start,
        end,
        message: `${name} is a helper: move it to a file of its own named for what it does, since ${file} holds only ${names.useCases}, ${names.factory} and their types.`,
      });
    }
  }
  if (!hasClass || !hasFactory) {
    problems.push({
      start: 0,
      end: 0,
      message: `${file} holds the class ${names.useCases} and its factory function ${names.factory}.`,
    });
  }
  return problems;
}

/**
 * Returns why a file of a feature breaks the feature's surface: a surface file that exports more than components, the
 * use cases and types, or a use cases file of the wrong shape. `text` is the file's text as the linter holds it.
 */
export function surfaceProblems({
  filename,
  from,
  text,
}: {
  filename: string;
  from: Place;
  text: string;
}): SurfaceProblem[] {
  if (from.layer !== "features") {
    return [];
  }
  // A surface per runtime gives out a use cases class of its own, named for the runtime.
  const surfaceRuntime = runtimeAfter(from.inside, "exports");
  if (surfaceRuntime !== null) {
    const names = useCasesNames(from.module, surfaceRuntime);
    return exportProblems({ filename, names, from, text });
  }
  const fileRuntime = runtimeAfter(from.inside, `${basename(from.module)}UseCases`);
  const own = fileRuntime === null ? undefined : useCasesNames(from.module, fileRuntime);
  if (own !== undefined && filename === own.file.replace(/\.ts$/, ".tsx")) {
    const message = `The use cases hold no JSX, so their file is ${basename(own.file)}, not ${basename(filename)}.`;
    return [{ start: 0, end: 0, message }];
  }
  return own?.file === filename ? useCasesProblems(own, text) : [];
}
