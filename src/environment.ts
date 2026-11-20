// The rule `kk-forge/environment`: outside infra, a file under src/ reads neither the clock, random
// numbers, the environment, chrome.i18n, the network, browser storage, navigator nor location, since
// the program controls none of them. A package's infra reads no environment, since each app's
// composition root passes the package its config. The console is left to `no-console` in
// `typescript.json`.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

import { isFeatureInfra, place, testFile } from "./places.js";
import { UnitKind, unitOfRoot } from "./repository.js";
import { isGlobal as isGlobalIn, referenceOf } from "./scope.js";

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

/**
 * The names of the global object. A browser gives it `window` and `self` too, so `window.location` reads what
 * `location` does. `document.location` is a property of `document`, not of the global object, so it stays out.
 */
const globalObjects = new Set(["globalThis", "window", "self"]);

/** Returns the value a record holds for a key it owns, so a key such as `constructor` finds nothing. */
const own = <Value>(record: Record<string, Value>, key: string): Value | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** Returns an expression without the casts around it: `as`, `satisfies`, `<T>` and the non-null `!`. */
function uncast(node: ESTree.Expression): ESTree.Expression {
  let inner = node;
  while (
    inner.type === "TSAsExpression" ||
    inner.type === "TSSatisfiesExpression" ||
    inner.type === "TSTypeAssertion" ||
    inner.type === "TSNonNullExpression"
  ) {
    inner = inner.expression;
  }
  return inner;
}

/** Returns the name a string literal, or a template literal without an expression, holds, or undefined. */
function literalName(node: ESTree.Node): string | undefined {
  if (node.type === "Literal") {
    return typeof node.value === "string" ? node.value : undefined;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** Returns the member a member expression reads by name: `x.name`, `x["name"]` or `` x[`name`] ``, or undefined. */
function memberName(node: ESTree.MemberExpression): string | undefined {
  if (!node.computed) {
    return node.property.type === "Identifier" ? node.property.name : undefined;
  }
  return literalName(node.property);
}

/** Returns the name of a destructured property's key, as `fetch` in `{ fetch }`, `{ "fetch": f }` or `{ fetch: f }`. */
function keyName(property: ESTree.Node): string | undefined {
  if (property.type !== "Property") {
    return undefined;
  }
  if (!property.computed && property.key.type === "Identifier") {
    return property.key.name;
  }
  return literalName(property.key);
}

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
    const isGlobal = (node: ESTree.Node): boolean => isGlobalIn(context, node);
    /** The default and namespace imports of a watched module, by their specifier, as in `import * as crypto`. */
    const moduleBindings = new Map<ESTree.Node, string>();
    /** Returns the watched module a name refers to through a default or namespace import, or undefined. */
    const importedModule = (node: ESTree.Node): string | undefined => {
      const definition = referenceOf(context, node)?.resolved?.defs[0];
      return definition === undefined ? undefined : moduleBindings.get(definition.node);
    };
    /** The globals any check of the rule names. A name outside this set skips the scope lookup. */
    const watched = new Set([
      ...Object.keys(watchedMembers),
      ...Object.keys(watchedGlobals),
      ...globalObjects,
    ]);
    /**
     * Returns the name an expression gives the global object, or undefined when it names none: a global `globalThis`,
     * `window` or `self`, one read off another, as in `globalThis.window`, and either under a cast, as in
     * `(window as any)`.
     */
    const globalObjectName = (node: ESTree.Expression): string | undefined => {
      const inner = uncast(node);
      if (inner.type === "Identifier") {
        return globalObjects.has(inner.name) && isGlobal(inner) ? inner.name : undefined;
      }
      if (inner.type !== "MemberExpression") {
        return undefined;
      }
      const member = memberName(inner);
      const object = globalObjectName(inner.object);
      return member !== undefined && globalObjects.has(member) && object !== undefined
        ? `${object}.${member}`
        : undefined;
    };
    /** Returns the global an expression names: `Date`, or `crypto` in `globalThis.crypto` or `window["crypto"]`. */
    const globalName = (node: ESTree.Expression): string | undefined => {
      const inner = uncast(node);
      if (inner.type === "Identifier") {
        return watched.has(inner.name) && isGlobal(inner) ? inner.name : undefined;
      }
      if (inner.type !== "MemberExpression") {
        return undefined;
      }
      const member = memberName(inner);
      return member !== undefined && globalObjectName(inner.object) !== undefined
        ? member
        : undefined;
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
        const member = memberName(node);
        if (member === undefined) {
          return;
        }
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
        const globalObject = globalObjectName(node.object);
        const read = globalObject === undefined ? undefined : own(watchedGlobals, member);
        if (read !== undefined) {
          report(node, `${globalObject}.${member}`, read);
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
      // `const { now } = Date` takes the member as `Date.now` does, and `const { fetch } = window` as `window.fetch`.
      VariableDeclarator(node) {
        if (node.id.type !== "ObjectPattern" || node.init === null) {
          return;
        }
        const globalObject = globalObjectName(node.init);
        const object = globalName(node.init);
        const members =
          globalObject !== undefined
            ? watchedGlobals
            : object === undefined
              ? undefined
              : own(watchedMembers, object);
        for (const property of node.id.properties) {
          const key = keyName(property);
          const reads = members === undefined || key === undefined ? undefined : own(members, key);
          if (reads !== undefined) {
            report(property, `${globalObject ?? object}.${key}`, reads);
          }
        }
      },
    };
  },
};

export default rule;
