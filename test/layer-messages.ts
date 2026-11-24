// The problem layers.json names for each case of #src/, the aliases and the app pairs, by fixture and file. test/configs.test.ts
// holds each report to its message, so a case that fails for another reason fails the test.
const subpath = '#src/, which package.json declares as "imports": { "#src/*": "./src/*" }';
const built = '"imports": { "#src/*": { "source": "./src/*", "default": "./dist/*" } }';
const mixedRuntimes =
  "entrypoints/mixed runs on chrome and tauri, as entrypoints/mixed/bad-chrome.ts imports #src/infra/chrome/exports, and entrypoints/mixed/bad-web-tauri.ts imports @pair/web/infra/tauri/exports: an entrypoint runs on one runtime, so it imports one platform's adapter and SDK.";
const forbidden =
  "An import into another app's source is forbidden: move the code both apps use into a package.";

export const layerMessages: readonly (readonly [fixture: string, file: string, message: string])[] =
  [
    [
      "layers",
      "src/shared/bad-at-alias.ts",
      `Import @/shared/log through ${subpath}, not through the alias @/.`,
    ],
    [
      "layers",
      "src/shared/bad-tilde-alias.ts",
      `Import ~/shared/log through ${subpath}, not through the alias ~/.`,
    ],
    [
      "layers",
      "tests/bad-tilde-alias.ts",
      `Import ~/shared/log through ${subpath}, not through the alias ~/.`,
    ],
    [
      "layers",
      "src/shared/bad-tsconfig-alias.ts",
      `Import #paths/shared/log through ${subpath}, since it names this src/ another way.`,
    ],
    ["layers", "src/features/a/bad-alias.ts", "features may not import features."],
    ["layers", "src/entities/user/bad-alias.ts", "entities may not import features."],
    ["monorepo", "apps/web/src/shared/bad-subpath-layer.ts", "shared may not import entrypoints."],
    [
      "monorepo",
      "apps/tool/src/shared/bad-subpath-undeclared.ts",
      `apps/tool/package.json declares no "imports": { "#src/*": "./src/*" } or ${built}, the forms through which #src/ names src/.`,
    ],
    [
      "monorepo",
      "apps/api/src/infra/bad-subpath-target.ts",
      `apps/api/package.json declares no "imports": { "#src/*": "./src/*" } or ${built}, the forms through which #src/ names src/.`,
    ],
    [
      "monorepo",
      "apps/built-default/src/shared/bad-subpath-built-default.ts",
      `apps/built-default/package.json declares no "imports": { "#src/*": "./src/*" } or ${built}, the forms through which #src/ names src/.`,
    ],
    [
      "monorepo",
      "apps/built-extra/src/shared/bad-subpath-built-extra.ts",
      `apps/built-extra/package.json declares no "imports": { "#src/*": "./src/*" } or ${built}, the forms through which #src/ names src/.`,
    ],
    [
      "monorepo",
      "apps/built-order/src/shared/bad-subpath-built-order.ts",
      `apps/built-order/package.json declares no "imports": { "#src/*": "./src/*" } or ${built}, the forms through which #src/ names src/.`,
    ],
    [
      "monorepo",
      "apps/built-source/src/shared/bad-subpath-built-source.ts",
      `apps/built-source/package.json declares no "imports": { "#src/*": "./src/*" } or ${built}, the forms through which #src/ names src/.`,
    ],
    [
      "monorepo",
      "apps/api/src/shared/bad-subpath-key.ts",
      'Import #/infra/ok-env through #src/ or #tests/, not through #/*, a key of apps/api/package.json the layers do not read: they read only "imports": { "#src/*": "./src/*", "#tests/*": "./tests/*" }.',
    ],
    [
      "app-pairs",
      "apps/desktop/src/entrypoints/window/bad-web-internal.ts",
      "Import this module through its exports.ts.",
    ],
    ["app-pairs", "apps/desktop/src/shared/bad-web-layer.ts", "shared may not import features."],
    ["app-pairs", "apps/desktop/src/entrypoints/window/bad-web-path.ts", forbidden],
    ["app-pairs", "apps/web/src/shared/bad-reverse.ts", forbidden],
    ["app-pairs", "apps/other/src/shared/bad-undeclared.ts", forbidden],
    [
      "app-pairs",
      "apps/desktop/src/entrypoints/window/bad-web-bare.ts",
      "Import a module of apps/web by its path under src/, as @pair/web/features/<name>/exports.",
    ],
    [
      "app-pairs",
      "apps/desktop/src/entrypoints/window/bad-web-dots.ts",
      "Import a module of apps/web by its path under src/, as @pair/web/features/<name>/exports.",
    ],
    [
      "app-pairs",
      "apps/desktop/src/entrypoints/window/bad-tool-exports.ts",
      'The "exports" of apps/tool/package.json is not { "./*": "./src/*" } alone, the one form through which another app imports it.',
    ],
    [
      "layers",
      "src/shared/bad-subpath-dots.ts",
      "#src/../src/shared/log holds a segment Node refuses, such as .., so it names no file of src/.",
    ],
    [
      "app-pairs",
      "apps/web/src/shared/bad-self-name.ts",
      `Import @pair/web/features/library/exports through ${subpath}, since it names this src/ another way.`,
    ],
    ["app-pairs", "apps/desktop/src/entrypoints/mixed/bad-chrome.ts", mixedRuntimes],
    ["app-pairs", "apps/desktop/src/entrypoints/mixed/bad-web-tauri.ts", mixedRuntimes],
    [
      "layers",
      "src/shared/bad-double-at.ts",
      `Import @@/src/shared/log through ${subpath}, not through the alias @@/.`,
    ],
    [
      "layers",
      "tests/bad-double-tilde.ts",
      `Import ~~/src/shared/log through ${subpath}, not through the alias ~~/.`,
    ],
    [
      "monorepo",
      "apps/web/tests/bad-tests-undeclared.ts",
      'apps/web/package.json declares no "imports": { "#tests/*": "./tests/*" }, the one form through which #tests/ names tests/.',
    ],
    [
      "app-pairs",
      "apps/other/src/shared/bad-self-plain.ts",
      `Import @pair/other/shared/x through ${subpath}, since it names this src/ another way.`,
    ],
    [
      "monorepo",
      "apps/web/src/shared/bad-subpath-narrow.ts",
      'Import #src/shared/narrow/bad-other-app through #src/ or #tests/, not through #src/shared/narrow/*, a key of apps/web/package.json the layers do not read: they read only "imports": { "#src/*": "./src/*", "#tests/*": "./tests/*" }.',
    ],
    [
      "layers",
      "src/features/a/bad-tests-helper.ts",
      "Code under src/ imports no test helper, so #tests/helpers stays with the tests that import it.",
    ],
    [
      "layers",
      "src/shared/bad-tests-path.ts",
      "Code under src/ imports no test helper, so ../../tests/helpers stays with the tests that import it.",
    ],
    [
      "app-pairs",
      "apps/web/src/entities/lone/bad-lone.ts",
      "Only apps/desktop/features/own imports entities/lone: move it into apps/desktop/features/own, since an entity is what two or more of them share.",
    ],
    [
      "layers",
      "src/bad-tests-outside-layer.ts",
      "Code under src/ imports no test helper, so #tests/helpers stays with the tests that import it.",
    ],
    [
      "app-pairs",
      "apps/web/src/entities/relay/bad-relay.ts",
      "Only apps/desktop/orchestration/sync imports entities/relay: move it into a feature that apps/desktop/orchestration/sync uses, since an entity is what two or more of them share.",
    ],
  ];
