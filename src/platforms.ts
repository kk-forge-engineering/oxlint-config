// The runtimes of one app. architecture/core.md gives an app on several runtimes one set of entrypoints per runtime and
// one adapter per platform, `infra/<platform>`. A platform's SDK and its global APIs live only in its adapter, and only
// the entrypoints of that platform's runtime import the adapter. Code that needs the platform declares a port, the
// adapter implements it, and the composition root passes it in. Every check reads the platforms from one table, so a
// new platform is one entry. oxlint lints one file at a time, so the check reads the other files of an entrypoint from
// disk.
import { statSync } from "node:fs";
import { sep } from "node:path";

import { importSpecifiers, sourceFile, sourceFiles } from "./imports.js";
import { isTestKit, pathFrom, type Place, placeOfImport } from "./places.js";
import { repositoryImport, type RepositoryImport, unitOfRoot } from "./repository.js";
import { newRecent } from "./recent.js";

/** One platform an app runs on: its adapter, its SDK, its global APIs and what an entrypoint may take from the SDK. */
export interface Platform {
  /** The adapter's folder under `infra`, which the messages also name the platform by. */
  adapter: string;
  /** The SDK's packages: the names it is, and the prefixes of the subpaths and scopes it holds. */
  sdk: { names: readonly string[]; prefixes: readonly string[] };
  /** The global APIs, by the names a reference resolves to. */
  globals: readonly string[];
  /** The members of a global that read the interface strings, which the environment rule reports as such. */
  interfaceStrings: readonly string[];
  /**
   * What an entrypoint may take from the SDK, by module: the entry API the framework defines or mounts an entrypoint
   * through, and the types of what it mounts. Empty where an entrypoint needs none.
   */
  entryApi: Readonly<Record<string, readonly string[]>>;
  /** The modules that re-export the whole entry API, such as a generated module of the framework's auto-imports. */
  entryApiAliases: readonly string[];
}

/** The platforms the preset knows. */
export const platforms: readonly Platform[] = [
  {
    adapter: "chrome",
    // WXT reaches the browser's extension API through `wxt`, its subpaths and the `#imports` it generates.
    sdk: { names: ["wxt", "#imports", "webextension-polyfill"], prefixes: ["wxt/", "@wxt-dev/"] },
    globals: ["chrome", "browser"],
    interfaceStrings: ["i18n"],
    entryApi: {
      "wxt/utils/define-background": ["defineBackground"],
      "wxt/utils/define-content-script": ["defineContentScript"],
      "wxt/utils/define-unlisted-script": ["defineUnlistedScript"],
      "wxt/utils/content-script-context": ["ContentScriptContext"],
      "wxt/utils/content-script-ui/shadow-root": [
        "createShadowRootUi",
        "ShadowRootContentScriptUi",
        "ShadowRootContentScriptUiOptions",
      ],
      "wxt/utils/content-script-ui/integrated": [
        "createIntegratedUi",
        "IntegratedContentScriptUi",
        "IntegratedContentScriptUiOptions",
      ],
      "wxt/utils/content-script-ui/iframe": [
        "createIframeUi",
        "IframeContentScriptUi",
        "IframeContentScriptUiOptions",
      ],
    },
    entryApiAliases: ["#imports"],
  },
  {
    adapter: "tauri",
    sdk: { names: [], prefixes: ["@tauri-apps/"] },
    globals: ["__TAURI__", "__TAURI_INTERNALS__"],
    interfaceStrings: [],
    // A Tauri window needs no entry API, so an entrypoint takes nothing from the SDK.
    entryApi: {},
    entryApiAliases: [],
  },
];

/** An import of the linted file: its specifier, and where it places when it names a module of the layers. */
export interface PlatformImport {
  specifier: string;
  to: Place | undefined;
  packageAdapter?: Platform | undefined;
}

/** Returns whether an import's target is another entrypoint than the module `self`. */
const isOtherEntrypoint = (to: Place | undefined, self: string): to is Place =>
  to?.layer === "entrypoints" && to.module !== self;

/** The platforms an entrypoint imports, each with the first import that shows it, as `<file> imports <specifier>`. */
type Found = Map<Platform, string>;

/** A file whose imports the walk takes as given in place of reading the file from disk: the linted file. */
interface Current {
  file: string;
  specifiers: readonly string[];
}

/** Returns the source files of an entrypoint module, less tests and test kits, with the linted file among them. */
function entrypointFiles(module: string, current: Current | undefined): string[] {
  if (module === current?.file || statSync(module, { throwIfNoEntry: false })?.isFile()) {
    return [module];
  }
  const files = sourceFiles(module).filter((file) => !isTestKit(file));
  return current !== undefined &&
    current.file.startsWith(module + sep) &&
    !files.includes(current.file)
    ? [...files, current.file]
    : files;
}

/** The checks over a list of platforms, which the rules build once. */
export interface PlatformChecks {
  /** Returns the platform whose adapter a module is, `infra/<adapter>` of an app or a package, or undefined. */
  adapterOf(at: Place | undefined): Platform | undefined;
  /** Returns the platform a named package adapter serves, or undefined for another package surface. */
  packageAdapterOf(target: RepositoryImport): Platform | undefined;
  /** Returns the platform whose global API a name is, or undefined. */
  globalOf(name: string): Platform | undefined;
  /**
   * Returns why a file under src/ that is no test or test kit may not import `specifier`, which places at `to` when it
   * names a module of the layers, or undefined when it may. A platform's SDK stays in its adapter, and only an
   * entrypoint imports an adapter. `names` holds the names the import takes, or undefined when it takes the whole
   * module or names none.
   */
  platformProblem(
    input: PlatformImport & { from: Place; names: readonly string[] | undefined },
  ): string | undefined;
  /** Returns whether a specifier names a platform's SDK, such as WXT's `#imports`. */
  isSdk: (specifier: string) => boolean;
  /**
   * Returns, for an entrypoint's file, why it may not make each of `imports`, the file's imports as the editor shows
   * them: an entrypoint runs on one runtime, so it imports the code of one platform. When the entrypoint imports two,
   * each import that brings one gets the problem, and the others get none.
   */
  entrypointPlatformProblems(input: {
    filename: string;
    from: Place;
    imports: readonly PlatformImport[];
  }): (string | undefined)[];
}

/**
 * The port advice each platform problem ends with. A module that needs the platform declares a port, the platform's
 * adapter implements it, and the composition root passes it in. An entrypoint imports the adapter itself.
 */
export const portAdvice = (platform: Platform, from: Place): string =>
  from.layer === "entrypoints"
    ? `wrap it in infra/${platform.adapter} and import that`
    : `declare a port where the code needs it, implement it in infra/${platform.adapter}, and let the composition root pass it in`;

/** Builds the platform checks over `list`, the preset's platforms unless a test adds one. */
export function newPlatformChecks(list: readonly Platform[] = platforms): PlatformChecks {
  const adapterOf = (at: Place | undefined): Platform | undefined =>
    at?.layer === "infra" ? list.find((platform) => platform.adapter === at.name) : undefined;
  const packageAdapterOf = (target: RepositoryImport): Platform | undefined =>
    target && "layer" in target && target.layer === "infra"
      ? list.find((platform) => platform.adapter === target.rest.split("/", 1)[0])
      : undefined;
  const globalOf = (name: string): Platform | undefined =>
    list.find((platform) => platform.globals.includes(name));
  const sdkOf = (specifier: string): Platform | undefined =>
    list.find(
      ({ sdk }) =>
        sdk.names.includes(specifier) ||
        sdk.prefixes.some((prefix) => specifier.startsWith(prefix)),
    );
  /** Returns the names an entrypoint may import from a module of a platform's SDK, or undefined for none. */
  const entryApiOf = (platform: Platform, specifier: string): readonly string[] | undefined =>
    platform.entryApiAliases.includes(specifier)
      ? Object.values(platform.entryApi).flat()
      : Object.hasOwn(platform.entryApi, specifier)
        ? platform.entryApi[specifier]
        : undefined;
  /**
   * Returns the platforms an entrypoint module imports: the SDKs and adapters its files import, and the platforms of the
   * other entrypoints they import, such as those a cumulative entrypoint starts. `seen` holds the entrypoints the walk
   * has entered, so a cycle ends. The walk takes the linted file's imports from `current`, which holds what the editor
   * shows, and reads the other files from disk.
   */
  function entrypointPlatforms(
    root: string,
    module: string,
    seen: Set<string>,
    current?: Current,
  ): Found {
    const found: Found = new Map();
    seen.add(module);
    const unit = unitOfRoot(root);
    for (const file of entrypointFiles(module, current)) {
      const specifiers = file === current?.file ? current.specifiers : importSpecifiers(file);
      for (const specifier of specifiers) {
        const sdk = sdkOf(specifier);
        const to = sdk === undefined ? placeOfImport(file, specifier) : undefined;
        const named =
          unit && !specifier.startsWith(".") ? repositoryImport(unit, file, specifier) : undefined;
        const adapter = sdk ?? packageAdapterOf(named) ?? adapterOf(to);
        const imported =
          adapter !== undefined
            ? [adapter]
            : isOtherEntrypoint(to, module) && !seen.has(to.module)
              ? [...entrypointPlatforms(root, to.module, seen, current).keys()]
              : [];
        for (const platform of imported) {
          if (!found.has(platform)) {
            found.set(platform, `${pathFrom(root, file)} imports ${specifier}`);
          }
        }
      }
    }
    return found;
  }

  /** Holds the platforms of each entrypoint another one imports for a second, so one run walks it once. */
  const recentPlatforms = newRecent<Found>();
  const importedEntrypointPlatforms = (root: string, module: string): Found =>
    recentPlatforms(module, () => entrypointPlatforms(root, module, new Set()));

  return {
    isSdk: (specifier) => sdkOf(specifier) !== undefined,
    adapterOf,
    globalOf,
    packageAdapterOf,
    platformProblem({ from, specifier, to, packageAdapter, names }) {
      const sdk = sdkOf(specifier);
      if (sdk !== undefined && adapterOf(from) !== sdk) {
        const entryApi = from.layer === "entrypoints" ? entryApiOf(sdk, specifier) : undefined;
        const outside =
          entryApi === undefined || names === undefined || names.length === 0
            ? undefined
            : names.filter((name) => !entryApi.includes(name));
        if (outside?.length === 0) {
          return undefined;
        }
        const taken = outside === undefined ? specifier : `${outside.join(", ")} from ${specifier}`;
        const allowed = [...new Set(Object.values(sdk.entryApi).flat())];
        const entry =
          from.layer === "entrypoints" && allowed.length > 0
            ? ` An entrypoint takes from it only the entry API that defines or mounts it, by name: ${allowed.join(", ")}.`
            : "";
        return `${taken} is the ${sdk.adapter} platform's SDK, which only infra/${sdk.adapter} imports: ${portAdvice(sdk, from)}.${entry}`;
      }
      const adapter = packageAdapter ?? adapterOf(to);
      if (adapter !== undefined && from.layer !== "entrypoints" && to?.module !== from.module) {
        const surface = packageAdapter ? specifier : `infra/${adapter.adapter}`;
        return `${surface} is the ${adapter.adapter} platform's adapter, which only the entrypoints of its runtime import: ${portAdvice(adapter, from)}.`;
      }
      return undefined;
    },
    entrypointPlatformProblems({ filename, from, imports }) {
      if (from.layer !== "entrypoints") {
        return imports.map(() => undefined);
      }
      const current = { file: filename, specifiers: imports.map((entry) => entry.specifier) };
      const found = entrypointPlatforms(from.root, from.module, new Set(), current);
      if (found.size < 2) {
        return imports.map(() => undefined);
      }
      const name = pathFrom(from.root, from.module).replace(sourceFile, "");
      const shown = [...found.values()].join(", and ");
      const runsOn = [...found.keys()].map((platform) => platform.adapter).join(" and ");
      const problem = `${name} runs on ${runsOn}, as ${shown}: an entrypoint runs on one runtime, so it imports one platform's adapter and SDK.`;
      return imports.map(({ specifier, to, packageAdapter }) =>
        sdkOf(specifier) !== undefined ||
        packageAdapter !== undefined ||
        adapterOf(to) !== undefined ||
        (isOtherEntrypoint(to, from.module) &&
          importedEntrypointPlatforms(from.root, to.module).size > 0)
          ? problem
          : undefined,
      );
    },
  };
}
