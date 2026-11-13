# @kk-forge/oxlint-config

Shared oxlint configs for KK Forge's TypeScript packages.

- `typescript.json`: the `correctness` category plus the rules it lacks that catch a bug or code that misleads its reader, type-aware, warnings fail. It turns on these besides:
  - The `no-unsafe-*` family, so a value typed `any` cannot be called, read, passed or returned unchecked.
  - `only-throw-error`, so every throw carries a stack.
  - The `no-unnecessary-*` family and `no-extraneous-class`: a cast, conversion, comparison, template or type parameter that changes nothing, a class of only statics, which is a module with extra syntax, and `import/no-named-as-default-member`, a default import read for a name the module also exports.
  - `no-console`, everywhere but a file named `Logger.ts`.
  - `import/no-unassigned-import`, so a side-effect import such as `import "./setup"` fails, since assembly is an explicit call. It allows `*.css`, and a `*.d.ts` file, where `import "x"` makes a module augmentation.
  - `kk-forge/no-index-files`, which rejects a file named `index.ts`, `index.tsx`, `index.js` or `index.jsx`, since tooling resolves that name implicitly. A module's surface is its `exports.ts`.
  - The `vitest` plugin's correctness rules, for an assertion that never runs or never awaits. `typescript/unbound-method` stays on in tests too: a test holds the mock itself, as in `const send = vi.fn(); const port = { send }; expect(send)…`, or `const send = vi.spyOn(port, "send")`.
- `solid.json`: eslint-plugin-solid's recommended rules, `solid/no-unused-signal`, `solid/no-accessor-as-prop`, the `jsx-a11y` plugin's correctness rules, and `kk-forge/no-conditional-map`. That last rule fails a `.map()` list of JSX nodes under a condition, such as `{open && rows.map(…)}`, `||`, `??` or `? :`. Solid reruns such an expression on any change and builds every row again, and `solid/prefer-for` catches only a `.map()` that is the whole expression. Render the list with `<For>` inside `<Show>`.
- `wxt.json`: the shape of a WXT entrypoint, under **WXT** below.
- `layers.json`: the layers `entrypoints → orchestration → features → entities → shared`. A file imports only layers to its right, and entities also each other. It reaches another module only through that module's `exports.ts`, or `exports.<entrypoint>.ts`, where `<entrypoint>` names a folder or file in `src/entrypoints`, such as `exports.background.ts` or `exports.overlay.content.ts`. A module that has a surface for an entrypoint serves that entrypoint through it. A `shared` module is one file, which is its own surface, or a folder reached through its `exports.ts`. Each file or folder directly under `infra/` is a module of its own. Only `entrypoints` and `infra` import `infra`, which takes `entities` and `shared`.

  A test in a `tests/` folder whose parent folder holds `src/` may import any layer. For a nested `tests/` folder, the innermost one with a `src/` beside it counts. In such a test, `@/` and `~/` name that `src/`. The test reaches a module, an `infra` folder included, only through its `exports.ts` or an `exports.<entrypoint>.ts`. A `shared` or `infra` module that is one file is its own surface. The test may import any file of an entrypoint, which has no surface. A unit test inside `src/`, such as `foo.unit.test.ts` beside `foo.ts`, follows the rules of its module's other files, so it may import that module's internals.

## Use

```bash
npm install -D @kk-forge/oxlint-config oxlint oxlint-tsgolint
```

A Solid package also installs `eslint-plugin-solid` 0.19. The presets need oxlint 1.93 or later. oxlint resolves `extends` from the config's folder, so give the path:

```json
{
  "extends": [
    "./node_modules/@kk-forge/oxlint-config/typescript.json",
    "./node_modules/@kk-forge/oxlint-config/solid.json"
  ]
}
```

The package's lint script runs bare `oxlint`, and its fix script `oxlint --fix`, over the whole package. `.gitignore` and the config's `ignorePatterns` say what to skip, so tests, build scripts and tool configs are linted too. A folder list such as `oxlint src` leaves the rest unlinted, and no rule in a preset can see that.

An app adds `"./node_modules/@kk-forge/oxlint-config/layers.json"` as a third entry. A library leaves it out, since the layers describe an app's `src/`. A package's own rules go below `extends` and win. A package's config holds only exceptions about its own files or names, each with its reason. A rule that would suit any package belongs in a preset.

## WXT

A WXT extension adds `"./node_modules/@kk-forge/oxlint-config/wxt.json"` to `extends`. Each entrypoint is then a folder `entrypoints/<name>/`, and WXT builds its `index.ts`. An HTML entrypoint's `index.html` loads `./index.ts` with a script tag, and `index.ts` mounts the page, as in `mountOptions()`. The rest of the entrypoint sits beside `index.ts` in the folder or in the layers.

- `kk-forge/wxt-entrypoint-folder` fails a script placed directly in a folder named `entrypoints`, such as `entrypoints/background.ts`. The rule reads the file's path, so it needs no glob from the package. oxlint reads no HTML, so review catches a flat `entrypoints/<name>.html`.
- For `**/entrypoints/*/index.ts` and `index.tsx`, `kk-forge/no-index-files` is off and `kk-forge/launcher` is on.

`kk-forge/launcher` allows imports and one line, which calls a function of the project, such as `startBackground()` or `mountOptions()`, where the logic lives. JSX is a call argument it rejects, so the file stays `index.ts`. Each form below holds one call: a named function called with identifiers, literals or property reads such as `ctx.signal`, which may stand under `void` or `await`. The line is one of these:

- The call itself, such as `mountOptions()`.
- The framework's definition around an arrow: `export default defineBackground(() => startBackground())`. The arrow's body is the call or a block that holds only the call, as in `async () => { await startBackground(); }`.
- The framework's definition around an options object: `export default defineContentScript({ matches: ["*://*/*"], main: (ctx) => mountOverlay(ctx) })`. One property is a function, written as an arrow, a method or `function`, whose body is the call or a block that holds only the call. Every other property holds a string, a number, a negative number, a boolean, `null`, a template without expressions, or an array or object of these.

In both definitions the function's parameters are plain names, with no defaults.

## From 4 to 5

- `kk-forge/one-line-entry` is now `kk-forge/launcher`, with no alias. A config that still names the old rule fails to load.
- `wxt.json` replaces the override a WXT package held for its `index.ts` files. Drop that override, and the flat-file override that turned the rule on for `entrypoints/<name>.ts`. Move each such file to `entrypoints/<name>/index.ts`.
- `typescript.json` turns on `import/no-unassigned-import`, allowing only `*.css`, and it is off in `*.d.ts`, where `import "x"` makes a module augmentation. A package drops its own copy of the rule. A side-effect import that assembles code, such as `import "./dependencies"`, becomes an explicit call.
- `typescript.json` and `solid.json` turn on the rules they list above that 4 lacked.
- The peer versions rise to oxlint 1.93, oxlint-tsgolint 7.0.2006 and eslint-plugin-solid 0.19.

## Development

`mise run setup` installs the packages. `mise run check` type-checks, lints and formats, builds the plugin in `src/` into `dist/`, and runs the fixtures through the configs and the packed plugin.

## Release

Raise `version` in package.json and merge to main. CI publishes to npm once the `production` environment approves.
