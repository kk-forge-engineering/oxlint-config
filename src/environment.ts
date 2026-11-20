// The rule `kk-forge/environment`: outside infra, a file under src/ reads neither the clock, random
// numbers, the environment, chrome.i18n, the network, browser storage, navigator nor location, since
// the program controls none of them. A package's
// infra reads no environment, since each app's composition root passes the package its config. The
// console is left to `no-console` in `typescript.json`.
import type { Context, CreateRule, ESTree, Scope } from "@oxlint/plugins";

import { isFeatureInfra, place, testFile } from "./places.js";
import { UnitKind, unitOfRoot } from "./repository.js";

/** What `process.env` and `import.meta.env` read, the one read a package's infra is held to as well. */
const environment = "the environment";

/** The globals whose members the rule watches, by the members it reports and what each reads. */
const watchedMembers: Record<string, Record<string, string>> = {
  Date: { now: "the clock" },
  performance: { now: "the clock" },
  Math: { random: "a random number" },
  crypto: { randomUUID: "a random id", getRandomValues: "random numbers" },
  process: { env: environment },
  chrome: { i18n: "the interface strings" },
};

/** The globals the rule watches wherever a reference names them, by what each reads. */
const watchedGlobals: Record<string, string> = {
  setTimeout: "the clock's timers",
  setInterval: "the clock's timers",
  fetch: "the network",
  navigator: "the browser's environment",
  location: "the page's address",
  localStorage: "browser storage",
  sessionStorage: "browser storage",
  indexedDB: "browser storage",
};

/**
 * Node's modules whose named exports the rule watches, by module without the `node:` prefix it also
 * accepts. The entrypoint owns the arguments of `process`, so only `process.env` counts.
 */
const watchedModules: Record<string, Record<string, string>> = {
  crypto: {
    randomUUID: "a random id",
    getRandomValues: "random numbers",
    randomBytes: "random numbers",
    randomInt: "a random number",
    randomFill: "random numbers",
    randomFillSync: "random numbers",
  },
  process: { env: environment },
  timers: {
    setTimeout: "the clock's timers",
    setInterval: "the clock's timers",
    setImmediate: "the clock's timers",
  },
  "timers/promises": {
    setTimeout: "the clock's timers",
    setInterval: "the clock's timers",
    setImmediate: "the clock's timers",
    scheduler: "the clock's timers",
  },
  perf_hooks: { performance: "the clock" },
};

/** Node's modules that do I/O or read the host whatever is taken from them, so their import itself is the read. */
const wholeModules: Record<string, string> = {
  fs: "the filesystem",
  "fs/promises": "the filesystem",
  os: "the host's environment",
};

/** Returns a module specifier without Node's `node:` prefix. */
const nodeModule = (source: string): string =>
  source.startsWith("node:") ? source.slice(5) : source;

const hint =
  "which only infra reads: take the value as a parameter, or a Clock, Random, config, strings facade " +
  "or port from the composition root";
const packageInfraHint =
  "which a package's infra does not read: take the value as a parameter from each app's composition root";

/** Returns the value a record holds for a key it owns, so a key such as `constructor` finds nothing. */
const own = <Value>(record: Record<string, Value>, key: string): Value | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Returns whether an identifier is named by a type query, as `navigator` is in `typeof navigator.clipboard`. */
function inTypeQuery(node: ESTree.Node): boolean {
  let parent = node.parent;
  while (parent?.type === "TSQualifiedName") {
    parent = parent.parent;
  }
  return parent?.type === "TSTypeQuery";
}

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Keeps the clock, randomness and the environment in infra" },
  },
  create(context: Context) {
    const at = place(context.filename);
    if (!at || testFile.test(context.filename)) {
      return {};
    }
    const isInfra = at.layer === "infra" || isFeatureInfra(at);
    const isPackageInfra = isInfra && unitOfRoot(at.root)?.kind === UnitKind.Package;
    if (isInfra && !isPackageInfra) {
      return {};
    }
    const report = (node: ESTree.Node, name: string, reads: string) => {
      if (!isPackageInfra) {
        context.report({ node, message: `${name} reads ${reads}, ${hint}.` });
      } else if (reads === environment) {
        context.report({ node, message: `${name} reads ${reads}, ${packageInfraHint}.` });
      }
    };
    /** Returns the reference an identifier makes, or undefined when it makes none, as a property name does. */
    const referenceOf = (node: ESTree.Node) => {
      for (
        let scope: Scope | null = context.sourceCode.getScope(node);
        scope;
        scope = scope.upper
      ) {
        const reference = scope.references.find((candidate) => candidate.identifier === node);
        if (reference) {
          return reference;
        }
      }
      return undefined;
    };
    /**
     * Returns whether an identifier is a reference that resolves to a global: a built-in the linter declares, or a name
     * no scope declares, such as `setTimeout` or `process`. A parameter, an import or a local of that name is no global.
     */
    const isGlobal = (node: ESTree.Node): boolean =>
      context.sourceCode.isGlobalReference(node) || referenceOf(node)?.resolved === null;
    /** The default and namespace imports of a watched module, by their specifier, as in `import * as crypto`. */
    const moduleBindings = new Map<ESTree.Node, string>();
    /** Returns the watched module a name refers to through a default or namespace import, or undefined. */
    const importedModule = (node: ESTree.Node): string | undefined => {
      const definition = referenceOf(node)?.resolved?.defs[0];
      return definition === undefined ? undefined : moduleBindings.get(definition.node);
    };
    /** The globals any check of the rule names. A name outside this set skips the scope lookup. */
    const watched = new Set([
      ...Object.keys(watchedMembers),
      ...Object.keys(watchedGlobals),
      "globalThis",
    ]);
    /** Returns the global an expression names: `Date`, or `crypto` in `globalThis.crypto`. */
    const globalName = (node: ESTree.Expression): string | undefined => {
      if (node.type === "Identifier") {
        return watched.has(node.name) && isGlobal(node) ? node.name : undefined;
      }
      if (
        node.type === "MemberExpression" &&
        !node.computed &&
        node.property.type === "Identifier" &&
        node.object.type === "Identifier" &&
        node.object.name === "globalThis" &&
        isGlobal(node.object)
      ) {
        return node.property.name;
      }
      return undefined;
    };
    /** Reports the import of a module whose import itself reads, and returns its watched exports otherwise. */
    const watchImport = (node: ESTree.Node, source: string): Record<string, string> | undefined => {
      const module = nodeModule(source);
      const whole = own(wholeModules, module);
      if (whole !== undefined) {
        report(node, `node:${module}`, whole);
        return undefined;
      }
      return own(watchedModules, module);
    };
    return {
      ImportDeclaration(node) {
        if (node.importKind === "type") {
          return;
        }
        const members = watchImport(node, node.source.value);
        if (members === undefined) {
          return;
        }
        const module = nodeModule(node.source.value);
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            moduleBindings.set(specifier, module);
            continue;
          }
          const name =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value;
          const reads = specifier.importKind === "type" ? undefined : own(members, name);
          if (reads !== undefined) {
            report(specifier, `node:${module}'s ${name}`, reads);
          }
        }
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && typeof node.source.value === "string") {
          const members = watchImport(node, node.source.value);
          if (members !== undefined) {
            report(
              node,
              `node:${nodeModule(node.source.value)}`,
              Object.values(members)[0] ?? environment,
            );
          }
        }
      },
      MemberExpression(node) {
        if (node.computed || node.property.type !== "Identifier") {
          return;
        }
        const member = node.property.name;
        // `crypto.randomUUID()` through `import * as crypto from "node:crypto"`.
        const viaImport =
          node.object.type === "Identifier" ? importedModule(node.object) : undefined;
        const importedReads =
          viaImport === undefined ? undefined : own(watchedModules[viaImport] ?? {}, member);
        if (importedReads !== undefined) {
          report(node, `node:${viaImport}'s ${member}`, importedReads);
          return;
        }
        if (node.object.type === "MetaProperty") {
          if (node.object.meta.name === "import" && member === "env") {
            report(node, "import.meta.env", environment);
          }
          return;
        }
        if (
          node.object.type === "Identifier" &&
          node.object.name === "globalThis" &&
          isGlobal(node.object)
        ) {
          const read = own(watchedGlobals, member);
          if (read !== undefined) {
            report(node, `globalThis.${member}`, read);
          }
        }
        const object = globalName(node.object);
        const members = object === undefined ? undefined : own(watchedMembers, object);
        const reads = members === undefined ? undefined : own(members, member);
        if (reads !== undefined) {
          report(node, `${object}.${member}`, reads);
        }
      },
      // `new Date()` and `Date()` read the clock. A Date built from a value reads nothing.
      NewExpression(node) {
        if (globalName(node.callee) === "Date" && node.arguments.length === 0) {
          report(node, "new Date()", "the clock");
        }
      },
      CallExpression(node) {
        if (globalName(node.callee) === "Date") {
          report(node, "Date()", "the clock");
        }
      },
      // A watched global reads whether the code calls it or passes it on, as in `const later = setTimeout`. A type such
      // as `typeof setTimeout` or `typeof navigator.clipboard` reads nothing, so the rule leaves a type position alone.
      Identifier(node) {
        const reads = own(watchedGlobals, node.name);
        if (reads !== undefined && !inTypeQuery(node) && isGlobal(node)) {
          report(node, node.name, reads);
        }
      },
      // `const { now } = Date` takes the member as `Date.now` does.
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || node.init === null) {
          return;
        }
        const object = globalName(node.init);
        const members = object === undefined ? undefined : own(watchedMembers, object);
        for (const property of node.id.properties) {
          const key =
            property.type === "Property" && property.key.type === "Identifier"
              ? property.key.name
              : undefined;
          const reads = members === undefined || key === undefined ? undefined : own(members, key);
          if (reads !== undefined) {
            report(property, `${object}.${key}`, reads);
          }
        }
      },
    };
  },
};

export default rule;
