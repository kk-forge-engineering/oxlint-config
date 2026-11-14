// Reads which names a TypeScript file exports and what each one is, as its declaration shows: a type, a component, a
// class, a function or another value. It follows a re-export and an import through the files they name, so a name a
// surface passes on from another file is judged by its declaration there.
import { readFileSync, statSync } from "node:fs";

import {
  type BindingPattern,
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
export type Kind = "type" | "component" | "class" | "function" | "value";

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

/** Returns what a declared function, class or initial value is. */
function kindOf(node: ExportDefaultDeclarationKind | null): Kind {
  const type = node?.type;
  if (
    type === "FunctionDeclaration" ||
    type === "TSDeclareFunction" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  ) {
    return isJsxElement(node?.returnType) ? "component" : "function";
  }
  if (type === "ClassDeclaration" || type === "ClassExpression") {
    return "class";
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

/** Returns each name a declaration declares, with what it is. */
export function declarationKinds(declaration: Declaration): [string, Kind][] {
  if (declaration.type === "VariableDeclaration") {
    return declaration.declarations.flatMap((declarator) =>
      bindingNames(declarator.id).map((name): [string, Kind] => [
        name,
        declarator.id.type === "Identifier" ? kindOf(declarator.init) : "value",
      ]),
    );
  }
  if (
    declaration.type === "FunctionDeclaration" ||
    declaration.type === "TSDeclareFunction" ||
    declaration.type === "ClassDeclaration"
  ) {
    return declaration.id === null ? [] : [[declaration.id.name, kindOf(declaration)]];
  }
  if (
    declaration.type === "TSTypeAliasDeclaration" ||
    declaration.type === "TSInterfaceDeclaration"
  ) {
    return [[declaration.id.name, "type"]];
  }
  // An enum, a namespace and `import x = require()` are values, which the check does not follow further.
  return declaration.id?.type === "Identifier" ? [[declaration.id.name, "value"]] : [];
}

/** Returns the declaration a specifier's module exports under a name, or undefined when it cannot be read. */
function importedDeclaration(
  { file, specifier, name }: { file: string; specifier: string; name: string },
  read: Read,
): Declared | undefined {
  const target = importTarget(file, specifier);
  const source = target === undefined ? undefined : fileAt(target);
  if (source === undefined) {
    return undefined;
  }
  return exportsOf(source, read).find((exported) => exported.name === name)?.declared;
}

/** Returns the declaration of a name the file's top level declares or imports, or undefined when it cannot be read. */
function localDeclaration(
  { file, program, name }: { file: string; program: Program; name: string },
  read: Read,
): Declared | undefined {
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
    if (declaration === null || !isDeclaration(declaration)) {
      continue;
    }
    const kind = declarationKinds(declaration).find(([declared]) => declared === name)?.[1];
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
 * The exports of each file one check has read, and the text of the linted file. A file still being read maps to none,
 * so a cycle of imports ends there.
 */
export interface Read {
  exports: Map<string, Exported[]>;
  linted: { file: string; text: string };
}

/** Returns the names an `export { … }` or `export <declaration>` statement exports, with their declarations. */
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
    return declarationKinds(statement.declaration).map(([name, kind]) => ({
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
        ? localDeclaration({ file, program, name: local }, read)
        : importedDeclaration({ file, specifier: statement.source.value, name: local }, read);
    return {
      name: nameOf(specifier.exported),
      start: specifier.start,
      end: specifier.end,
      declared,
    };
  });
}

/** Returns the names an `export * from` statement exports, each at the statement. */
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
  return exportsOf(source, read)
    .filter((each) => each.name !== "default")
    .map((each) => ({ ...each, ...at }));
}

/** Returns each name a file exports, with its declaration. */
export function exportsOf(file: string, read: Read): Exported[] {
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
        ? localDeclaration({ file, program, name: declaration.name }, read)
        : { kind: kindOf(declaration), file };
    return [{ name: "default", start: statement.start, end: statement.end, declared }];
  });
  read.exports.set(file, exported);
  return exported;
}
