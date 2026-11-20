// The rule `kk-forge/environment`: outside infra, a file under src/ reads neither the clock, random
// numbers, the environment, a platform's interface strings, the network, browser storage, navigator
// nor location, since the program controls none of them. A package's infra reads no environment,
// since each app's composition root passes the package its config. A platform's global APIs stay in
// that platform's adapter, infra/<adapter>, as src/platforms.ts lists them. The console is left to
// `no-console` in `typescript.json`.
import type { Context, CreateRule, ESTree } from "@oxlint/plugins";

import { isFeatureInfra, isTestKit, place, testFile } from "./places.js";
import { newPlatformChecks, type Platform, platforms, portAdvice } from "./platforms.js";
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
};

/** What a platform's member such as its strings API reads, which the rule reports outside infra. */
const interfaceStrings = "the interface strings";

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

/**
 * Returns whether an expression is read only for a platform's interface strings: the object of such a member, or the
 * value a destructuring of only such members reads.
 */
function readsInterfaceStrings(node: ESTree.Node, platform: Platform): boolean {
  const parent = node.parent;
  const isStrings = (name: string | undefined) =>
    name !== undefined && platform.interfaceStrings.includes(name);
  if (parent?.type === "MemberExpression" && parent.object === node) {
    return isStrings(memberName(parent));
  }
  return (
    parent?.type === "VariableDeclarator" &&
    parent.init === node &&
    parent.id.type === "ObjectPattern" &&
    parent.id.properties.length > 0 &&
    parent.id.properties.every((property) => isStrings(keyName(property)))
  );
}

/** Returns whether an identifier is named by a type query, as `navigator` is in `typeof navigator.clipboard`. */
function inTypeQuery(node: ESTree.Node): boolean {
  let parent = node.parent;
  while (parent?.type === "TSQualifiedName") {
    parent = parent.parent;
  }
  return parent?.type === "TSTypeQuery";
}

/** Builds the rule over a list of platforms, the preset's own unless a test adds one. */
export function newEnvironmentRule(list: readonly Platform[] = platforms): CreateRule {
  const checks = newPlatformChecks(list);
  /** The watched members, with each platform global's members that read the interface strings. */
  const memberReads: Record<string, Record<string, string>> = { ...watchedMembers };
  for (const platform of list) {
    for (const global of platform.globals) {
      for (const member of platform.interfaceStrings) {
        memberReads[global] = { ...memberReads[global], [member]: interfaceStrings };
      }
    }
  }
  return {
    meta: {
      type: "problem",
      docs: {
        description:
          "Keeps the clock, randomness and the environment in infra, and each platform's globals in its adapter",
      },
    },
    create(context: Context) {
      const at = place(context.filename);
      if (!at || testFile.test(context.filename)) {
        return {};
      }
      const isInfra = at.layer === "infra" || isFeatureInfra(at);
      const isPackageInfra = isInfra && unitOfRoot(at.root)?.kind === UnitKind.Package;
      // An app's infra reads what the program does not control, so only the platform checks run there.
      const checksReads = !isInfra || isPackageInfra;
      // A test kit stands in for each platform with fakes, as a test does. The adapter of a platform uses its globals.
      const ownPlatform = checks.adapterOf(at);
      const watchedPlatformGlobals = new Map(
        isTestKit(context.filename)
          ? []
          : list.flatMap((platform) =>
              platform === ownPlatform
                ? []
                : platform.globals.map((name) => [name, platform] as const),
            ),
      );
      if (!checksReads && watchedPlatformGlobals.size === 0) {
        return {};
      }
      const report = (node: ESTree.Node, name: string, reads: string) => {
        if (!checksReads) {
          return;
        }
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
      /**
       * Reports a platform's global API used outside its adapter. Outside infra, a member that reads the interface
       * strings reports as such, so that site gets one report.
       */
      const reportPlatform = (node: ESTree.Node, name: string, global: string) => {
        const platform = watchedPlatformGlobals.get(global);
        if (
          platform === undefined ||
          (checksReads && !isPackageInfra && readsInterfaceStrings(node, platform))
        ) {
          return;
        }
        context.report({
          node,
          message: `${name} is the ${platform.adapter} platform's API, which only infra/${platform.adapter} uses: ${portAdvice(platform, at)}.`,
        });
      };
      /** The globals any check of the rule names. A name outside this set skips the scope lookup. */
      const watched = new Set([
        ...Object.keys(memberReads),
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
      const watchImport = (
        node: ESTree.Node,
        source: string,
      ): Record<string, string> | undefined => {
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
          if (globalObject !== undefined) {
            reportPlatform(node, `${globalObject}.${member}`, member);
          }
          const object = globalName(node.object);
          const members = object === undefined ? undefined : own(memberReads, object);
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
          if (watchedPlatformGlobals.has(node.name) && isGlobal(node)) {
            reportPlatform(node, node.name, node.name);
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
                : own(memberReads, object);
          for (const property of node.id.properties) {
            const key = keyName(property);
            const reads =
              members === undefined || key === undefined ? undefined : own(members, key);
            if (reads !== undefined) {
              report(property, `${globalObject ?? object}.${key}`, reads);
            }
            if (globalObject !== undefined && key !== undefined) {
              reportPlatform(property, `${globalObject}.${key}`, key);
            }
          }
        },
      };
    },
  };
}

export default newEnvironmentRule();
