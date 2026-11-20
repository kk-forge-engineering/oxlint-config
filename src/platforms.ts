// The runtimes of one app. architecture/core.md gives an app on several runtimes one set of entrypoints per runtime and
// one adapter per platform, `infra/chrome` and `infra/tauri`. A platform's SDK and its global APIs live only in its
// adapter, and only the entrypoints of that platform's runtime import the adapter. A feature's infra/ that needs the
// platform declares a port, the adapter implements it, and the composition root passes it in. oxlint lints one file at
// a time, so the check reads the other files of an entrypoint from disk.
import { statSync } from "node:fs";
import { sep } from "node:path";

import { importSpecifiers, sourceFile, sourceFiles } from "./imports.js";
import { isTestKit, pathFrom, type Place, placeOfImport } from "./places.js";
import { newRecent } from "./recent.js";

/** The platforms by the folder of their adapter, `infra/<platform>`. */
const platforms = ["chrome", "tauri"] as const;
type Platform = (typeof platforms)[number];

/** Each platform's SDK: the package names it is, and the prefixes of the subpaths and scopes it holds. */
const sdks: Record<Platform, { names: readonly string[]; prefixes: readonly string[] }> = {
  // WXT reaches the browser's extension API through `wxt`, its subpaths and the `#imports` it generates.
  chrome: { names: ["wxt", "#imports", "webextension-polyfill"], prefixes: ["wxt/", "@wxt-dev/"] },
  tauri: { names: [], prefixes: ["@tauri-apps/"] },
};

/**
 * Each platform's global APIs, by the names a reference resolves to: the extension API's `chrome` and `browser`, and
 * the objects Tauri puts on the window.
 */
export const platformGlobals: Record<Platform, readonly string[]> = {
  chrome: ["chrome", "browser"],
  tauri: ["__TAURI__", "__TAURI_INTERNALS__"],
};

/**
 * What an entrypoint may take from the chrome SDK, by module: the entry API WXT defines or mounts an entrypoint
 * through, and the types of what it mounts. `#imports` re-exports each. A Tauri window needs no such API, so an
 * entrypoint takes nothing from the tauri SDK.
 */
const chromeEntryApi: Record<string, readonly string[]> = {
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
};

/** Returns the names an entrypoint may import from a module of the chrome SDK, or undefined for none. */
const entryApiOf = (specifier: string): readonly string[] | undefined =>
  specifier === "#imports"
    ? Object.values(chromeEntryApi).flat()
    : Object.hasOwn(chromeEntryApi, specifier)
      ? chromeEntryApi[specifier]
      : undefined;

const isPlatform = (value: string | undefined): value is Platform =>
  platforms.some((platform) => platform === value);

/** Returns the platform whose SDK a specifier names, as written, or undefined. */
function sdkOf(specifier: string): Platform | undefined {
  return platforms.find(
    (platform) =>
      sdks[platform].names.includes(specifier) ||
      sdks[platform].prefixes.some((prefix) => specifier.startsWith(prefix)),
  );
}

/** Returns the platform whose adapter a module is, `infra/<platform>` of an app or a package, or undefined. */
export const adapterOf = (to: Place | undefined): Platform | undefined =>
  to?.layer === "infra" && isPlatform(to.name) ? to.name : undefined;

/** Returns whether an import's target is another entrypoint than the module `self`. */
const isOtherEntrypoint = (to: Place | undefined, self: string): to is Place =>
  to?.layer === "entrypoints" && to.module !== self;

/** The platforms an entrypoint imports, each with the first import that shows it, as `<file> imports <specifier>`. */
type Platforms = Map<Platform, string>;

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
): Platforms {
  const found: Platforms = new Map();
  seen.add(module);
  for (const file of entrypointFiles(module, current)) {
    const specifiers = file === current?.file ? current.specifiers : importSpecifiers(file);
    for (const specifier of specifiers) {
      const sdk = sdkOf(specifier);
      const to = sdk === undefined ? placeOfImport(file, specifier) : undefined;
      const adapter = sdk ?? adapterOf(to);
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
const recentPlatforms = newRecent<Platforms>();

const importedEntrypointPlatforms = (root: string, module: string): Platforms =>
  recentPlatforms(module, () => entrypointPlatforms(root, module, new Set()));

/** An import of the linted file: its specifier, and where it places when it names a module of the layers. */
export interface PlatformImport {
  specifier: string;
  to: Place | undefined;
}

/**
 * The port advice each platform problem ends with. A module that needs the platform declares a port, the platform's
 * adapter implements it, and the composition root passes it in.
 */
export const portAdvice = (platform: string, from: Place): string =>
  from.layer === "entrypoints"
    ? `wrap it in infra/${platform} and import that`
    : `declare a port where the code needs it, implement it in infra/${platform}, and let the composition root pass it in`;

/**
 * Returns why a file under src/ that is no test or test kit may not import `specifier`, which places at `to` when it
 * names a module of the layers, or undefined when it may. A platform's SDK stays in its adapter, and only an
 * entrypoint imports an adapter.
 */
export function platformProblem({
  from,
  specifier,
  to,
  names,
}: PlatformImport & {
  from: Place;
  /** The names the import takes, or undefined when it takes the whole module or names none. */
  names: readonly string[] | undefined;
}): string | undefined {
  const sdk = sdkOf(specifier);
  if (sdk !== undefined && adapterOf(from) !== sdk) {
    const entryApi = from.layer === "entrypoints" ? entryApiOf(specifier) : undefined;
    const outside =
      entryApi === undefined || names === undefined || names.length === 0
        ? undefined
        : names.filter((name) => !entryApi.includes(name));
    if (outside?.length === 0) {
      return undefined;
    }
    const taken = outside === undefined ? specifier : `${outside.join(", ")} from ${specifier}`;
    const entry =
      from.layer === "entrypoints" && sdk === "chrome"
        ? ` An entrypoint takes from it only the entry API that defines or mounts it, by name: ${[...new Set(Object.values(chromeEntryApi).flat())].join(", ")}.`
        : "";
    return `${taken} is the ${sdk} platform's SDK, which only infra/${sdk} imports: ${portAdvice(sdk, from)}.${entry}`;
  }
  const adapter = adapterOf(to);
  if (adapter !== undefined && from.layer !== "entrypoints" && to?.module !== from.module) {
    return `infra/${adapter} is the ${adapter} platform's adapter, which only the entrypoints of its runtime import: ${portAdvice(adapter, from)}.`;
  }
  return undefined;
}

/**
 * Returns, for an entrypoint's file, why it may not make each of `imports`, the file's imports as the editor shows
 * them: an entrypoint runs on one runtime, so it imports the code of one platform. When the entrypoint imports two,
 * each import that brings one gets the problem, and the others get none.
 */
export function entrypointPlatformProblems({
  filename,
  from,
  imports,
}: {
  filename: string;
  from: Place;
  imports: readonly PlatformImport[];
}): (string | undefined)[] {
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
  const problem = `${name} runs on ${[...found.keys()].join(" and ")}, as ${shown}: an entrypoint runs on one runtime, so it imports one platform's adapter and SDK.`;
  return imports.map(({ specifier, to }) =>
    sdkOf(specifier) !== undefined ||
    adapterOf(to) !== undefined ||
    (isOtherEntrypoint(to, from.module) &&
      importedEntrypointPlatforms(from.root, to.module).size > 0)
      ? problem
      : undefined,
  );
}
