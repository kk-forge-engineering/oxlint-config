// Reads which names a TypeScript file exports and what each one is, as its
// declaration shows: a type, a component, an error class, another class, a
// function or another value. It follows a re-export and an import to the file
// they name, so this file judges a passed-on name by its declaration there.
import { readFileSync, statSync } from "node:fs";
import { sep } from "node:path";

import {
  type BindingPattern,
  type Class,
  type Declaration,
  type ExportAllDeclaration,
  type ExportDefaultDeclarationKind,
  type ExportNamedDeclaration,
  type ModuleExportName,
  parseSync,
  type Program,
  type TSTypeAnnotation,
} from "oxc-parser";

import { fileAt, importTarget } from "./places.js";

/** What an exported name is, as its declaration shows. */
export type Kind = "type" | "component" | "error" | "class" | "function" | "value";

/** A name's declaration: what it is, and the file that declares it. */
export interface Declared {
  kind: Kind;
  file: string;
}

/** One name a file exports, with where the file exports it, and its declaration, or undefined when none can be read. */
export interface Exported {
  name: string;
  start: number;
  end: number;
  declared: Declared | undefined;
}

/**
 * Holds the parsed program of each file read so far. A long-lived oxlint, such as the language server, parses a file
 * again only once its time or size changes.
 */
const programs = new Map<string, { stamp: string; program: Program }>();

/** Returns the program in a file, parsed from `text` when given, as the linted file's text is. */
export function programOf(file: string, text?: string): Program {
  if (text !== undefined) {
    return parseSync(file, text).program;
  }
  const { mtimeMs, size } = statSync(file);
  const stamp = `${mtimeMs}:${size}`;
  const known = programs.get(file);
  if (known?.stamp === stamp) {
    return known.program;
  }
  const { program } = parseSync(file, readFileSync(file, "utf8"));
  programs.set(file, { stamp, program });
  return program;
}

const nameOf = (name: ModuleExportName): string =>
  name.type === "Literal" ? name.value : name.name;

/** Returns whether a return type is `JSX.Element`, written as such. */
function isJsxElement(returnType: TSTypeAnnotation | null | undefined): boolean {
  const type = returnType?.typeAnnotation;
  return (
    type?.type === "TSTypeReference" &&
    type.typeName.type === "TSQualifiedName" &&
    type.typeName.left.type === "Identifier" &&
    type.typeName.left.name === "JSX" &&
    type.typeName.right.name === "Element"
  );
}

/** The file a declaration sits in, its program, and what the check has read. */
interface Scope {
  file: string;
  program: Program;
  read: Read;
}

/** Returns whether a file's top level declares or imports a name. */
function binds(program: Program, name: string): boolean {
  return program.body.some((statement) => {
    if (statement.type === "ImportDeclaration") {
      return statement.specifiers.some((specifier) => specifier.local.name === name);
    }
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    return (
      declaration !== null &&
      isDeclaration(declaration) &&
      declarationNames(declaration).includes(name)
    );
  });
}

/**
 * Returns "error" for a class that extends the global `Error`, or an error
 * class from a file of the same feature, followed through its imports. A parent
 * the check cannot read, such as a package's class, makes it "class".
 */
function classKind(node: Class, scope: Scope): Kind {
  const parent = node.superClass;
  const inFeature = (file: string) => file.startsWith(scope.read.feature + sep);
  // A class outside the feature counts as a plain class. A surface may give out
  // only its own error classes, not one from shared or entities.
  if (parent?.type !== "Identifier" || scope.read.classes.has(node) || !inFeature(scope.file)) {
    return "class";
  }
  if (!binds(scope.program, parent.name)) {
    return parent.name === "Error" ? "error" : "class";
  }
  scope.read.classes.add(node);
  const declared = localDeclaration({ ...scope, name: parent.name });
  scope.read.classes.delete(node);
  return declared?.kind === "error" && inFeature(declared.file) ? "error" : "class";
}

/** Returns what a declared function, class or initial value is. */
function kindOf(node: ExportDefaultDeclarationKind | null, scope: Scope): Kind {
  const type = node?.type;
  if (
    type === "FunctionDeclaration" ||
    type === "TSDeclareFunction" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  ) {
    return isJsxElement(node?.returnType) ? "component" : "function";
  }
  if (node?.type === "ClassDeclaration" || node?.type === "ClassExpression") {
    return classKind(node, scope);
  }
  return type === "TSInterfaceDeclaration" ? "type" : "value";
}

/** Returns the names a binding pattern declares, as `{ a, b: [c] }` declares a and c. */
function bindingNames(pattern: BindingPattern): string[] {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        bindingNames(property.type === "RestElement" ? property.argument : property.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap((element) =>
        element === null
          ? []
          : bindingNames(element.type === "RestElement" ? element.argument : element),
      );
    case "AssignmentPattern":
      return pattern.left.type === "Identifier" ||
        pattern.left.type === "ObjectPattern" ||
        pattern.left.type === "ArrayPattern"
        ? bindingNames(pattern.left)
        : [];
  }
}

function declarationNames(declaration: Declaration): string[] {
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations.flatMap((declarator) => bindingNames(declarator.id));
  }
  return declaration.id?.type === "Identifier" ? [declaration.id.name] : [];
}

function declarationKinds(declaration: Declaration, scope: Scope): [string, Kind][] {
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations.flatMap((declarator) =>
      bindingNames(declarator.id).map((name): [string, Kind] => [
        name,
        declarator.id.type === "Identifier" ? kindOf(declarator.init, scope) : "value",
      ]),
    );
  }
  if (
    declaration.type === "FunctionDeclaration" ||
    declaration.type === "TSDeclareFunction" ||
    declaration.type === "ClassDeclaration"
  ) {
    return declaration.id === null ? [] : [[declaration.id.name, kindOf(declaration, scope)]];
  }
  if (
    declaration.type === "TSTypeAliasDeclaration" ||
    declaration.type === "TSInterfaceDeclaration" ||
    declaration.type === "TSEnumDeclaration"
  ) {
    // An enum counts as a type, so a surface may give it out.
    return [[declaration.id.name, "type"]];
  }
  // A namespace and `import x = require()` count as values. The check does not
  // follow them to their declarations.
  return declaration.id?.type === "Identifier" ? [[declaration.id.name, "value"]] : [];
}

/**
 * Returns the declaration that a specifier's module exports under a name, or
 * undefined when the module cannot be found or read.
 */
function importedDeclaration(
  { file, specifier, name }: { file: string; specifier: string; name: string },
  read: Read,
): Declared | undefined {
  const target = importTarget(file, specifier);
  const source = target === undefined ? undefined : fileAt(target);
  if (source === undefined) {
    return undefined;
  }
  return readExports(source, read).find((exported) => exported.name === name)?.declared;
}

/**
 * Returns the declaration of a name the file's top level declares or imports,
 * or undefined when none can be read.
 */
function localDeclaration({
  file,
  program,
  read,
  name,
}: Scope & { name: string }): Declared | undefined {
  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers) {
        if (specifier.local.name !== name) {
          continue;
        }
        if (
          statement.importKind === "type" ||
          (specifier.type === "ImportSpecifier" && specifier.importKind === "type")
        ) {
          return { kind: "type", file };
        }
        if (specifier.type === "ImportNamespaceSpecifier") {
          return { kind: "value", file };
        }
        const imported =
          specifier.type === "ImportSpecifier" ? nameOf(specifier.imported) : "default";
        return importedDeclaration(
          { file, specifier: statement.source.value, name: imported },
          read,
        );
      }
      continue;
    }
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    // The function reads only the name's own declaration. A chain of classes in
    // one file is then followed once per class.
    if (
      declaration === null ||
      !isDeclaration(declaration) ||
      !declarationNames(declaration).includes(name)
    ) {
      continue;
    }
    const kind = declarationKinds(declaration, { file, program, read }).find(
      ([declared]) => declared === name,
    )?.[1];
    if (kind !== undefined) {
      return { kind, file };
    }
  }
  return undefined;
}

const declarationTypes = new Set<string>([
  "VariableDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "TSImportEqualsDeclaration",
]);

export const isDeclaration = (node: Program["body"][number]): node is Declaration =>
  declarationTypes.has(node.type);

/**
 * What one check has read: each file's exports and the linted file's text.
 * A file still being read maps to no exports, so an import cycle ends.
 */
interface Read {
  exports: Map<string, Exported[]>;
  linted: { file: string; text: string };
  /** The feature's folder, inside which the check follows a class's parent. */
  feature: string;
  /** Classes whose parent the check follows now, so an `extends` cycle ends. */
  classes: Set<Class>;
}

/** Returns the names an `export { … }` or `export <declaration>` exports. */
function namedExports(
  {
    file,
    program,
    statement,
  }: { file: string; program: Program; statement: ExportNamedDeclaration },
  read: Read,
): Exported[] {
  const at = { start: statement.start, end: statement.end };
  if (statement.declaration !== null) {
    return declarationKinds(statement.declaration, { file, program, read }).map(([name, kind]) => ({
      name,
      ...at,
      declared: { kind: statement.exportKind === "type" ? "type" : kind, file },
    }));
  }
  return statement.specifiers.map((specifier) => {
    const local = nameOf(specifier.local);
    const isType = statement.exportKind === "type" || specifier.exportKind === "type";
    const declared: Declared | undefined = isType
      ? { kind: "type", file }
      : statement.source === null
        ? localDeclaration({ file, program, read, name: local })
        : importedDeclaration({ file, specifier: statement.source.value, name: local }, read);
    return {
      name: nameOf(specifier.exported),
      start: specifier.start,
      end: specifier.end,
      declared,
    };
  });
}

/**
 * Returns the names an `export * from` statement exports, each placed at the
 * statement, or one `* from …` entry with no declaration when the module
 * cannot be found.
 */
function allExports(
  { file, statement }: { file: string; statement: ExportAllDeclaration },
  read: Read,
): Exported[] {
  const at = { start: statement.start, end: statement.end };
  if (statement.exportKind === "type") {
    return [];
  }
  if (statement.exported !== null) {
    return [{ name: nameOf(statement.exported), ...at, declared: { kind: "value", file } }];
  }
  const target = importTarget(file, statement.source.value);
  const source = target === undefined ? undefined : fileAt(target);
  if (source === undefined) {
    return [{ name: `* from ${statement.source.value}`, ...at, declared: undefined }];
  }
  return readExports(source, read)
    .filter((each) => each.name !== "default")
    .map((each) => ({ ...each, ...at }));
}

/**
 * Returns each name a file exports, with its declaration. It stores the result
 * in `read`, and gives none for a file it is still reading.
 */
function readExports(file: string, read: Read): Exported[] {
  const known = read.exports.get(file);
  if (known) {
    return known;
  }
  read.exports.set(file, []);
  const program = programOf(file, file === read.linted.file ? read.linted.text : undefined);
  const exported = program.body.flatMap((statement): Exported[] => {
    if (statement.type === "ExportNamedDeclaration") {
      return namedExports({ file, program, statement }, read);
    }
    if (statement.type === "ExportAllDeclaration") {
      return allExports({ file, statement }, read);
    }
    if (statement.type !== "ExportDefaultDeclaration") {
      return [];
    }
    const { declaration } = statement;
    const declared: Declared | undefined =
      declaration.type === "Identifier"
        ? localDeclaration({ file, program, read, name: declaration.name })
        : { kind: kindOf(declaration, { file, program, read }), file };
    return [{ name: "default", start: statement.start, end: statement.end, declared }];
  });
  read.exports.set(file, exported);
  return exported;
}

/**
 * Returns each name a file exports, with its declaration. `text` is the file's
 * text as the linter holds it. `feature` is the feature's folder, inside which
 * this function follows a class to its parent error class.
 */
export function exportsOf({
  file,
  text,
  feature,
}: {
  file: string;
  text: string;
  feature: string;
}): Exported[] {
  return readExports(file, {
    exports: new Map(),
    linted: { file, text },
    feature,
    classes: new Set(),
  });
}
