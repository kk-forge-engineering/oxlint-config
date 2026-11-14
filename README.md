# @kk-forge/oxlint-config

Shared oxlint configs for KK Forge's TypeScript packages.

Each preset owns one concern, so a package extends only the ones that describe it, and any combination works. Every preset that uses a `kk-forge` rule loads the plugin itself, and a config that extends several reports each problem once.

| Package                               | Presets                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- |
| TypeScript library                    | `typescript.json`                                                         |
| TypeScript library tested with vitest | `typescript.json`, `vitest.json`                                          |
| Solid library                         | `typescript.json`, `solid.json`, `vitest.json`                            |
| Node service or CLI                   | `typescript.json`, `layers.json`, `vitest.json`                           |
| Solid web app                         | `typescript.json`, `solid.json`, `layers.json`, `vitest.json`             |
| WXT extension with Solid              | `typescript.json`, `solid.json`, `layers.json`, `wxt.json`, `vitest.json` |

- `typescript.json`, the language: the `correctness` category plus the rules it lacks that catch a bug or code that misleads its reader, type-aware, warnings fail. It turns on these besides:
  - The `no-unsafe-*` family and `no-unsafe-type-assertion`, so a value typed `any`, or cast to a type it was never checked against, cannot flow on unchecked. A value from outside, such as JSON or a message, gets a parser.
  - `only-throw-error` and `prefer-promise-reject-errors`, so every throw and rejection carries a stack.
  - `no-deprecated`, so a deprecated API is replaced when it is first used, not when it is removed.
  - The `no-unnecessary-*` family, `no-extraneous-class` and `import/no-named-as-default-member`: a cast, conversion, comparison, template or type parameter that changes nothing, a class of only statics, which is a module with extra syntax, and a default import read for a name the module also exports.
  - `eqeqeq`, keeping `== null`, which tests for both `null` and `undefined`. `curly`, so a guard is never one line without braces. `max-lines` at 450 lines of code, the size past which code-style.md splits a file. Blank lines and comments do not count, since they carry no logic. A flat command dispatch, which code-style.md measures by its longest arm, takes a disable comment with that reason.
  - `no-console`, everywhere but the logger, `src/shared/Logger.ts`, as core.md names it.
  - `import/no-unassigned-import`, so a side-effect import such as `import "./setup"` fails, since assembly is an explicit call. It allows `*.css`, and a `*.d.ts` file, where `import "x"` makes a module augmentation.
  - `kk-forge/no-index-files`, which rejects a file named `index.ts`, `index.tsx`, `index.js` or `index.jsx`, since tooling resolves that name implicitly. A module's surface is its `exports.ts`.

  A function that returns a value on one path and nothing on another hides a missing branch. The package's `tsconfig.json` sets `"noImplicitReturns": true`, which catches that, so the presets add no lint rule for it.

- `vitest.json`, the tests: the `vitest` plugin's correctness rules on `*.test.*` and `*.spec.*` files, which is vitest's own default include. They catch an assertion that never runs, never awaits or sits in a branch, a focused or skipped test, and a `vi.fn()` without its type, which is an `any` in the test. A test holds the typed mock itself, as in `const send = vi.fn<Port["send"]>(); const port = { send }; expect(send)…`, or `const send = vi.spyOn(port, "send")`. Reading `port.send` instead trips `typescript/unbound-method`, which `typescript.json` keeps on in tests too.
- `solid.json`, Solid and its JSX: eslint-plugin-solid's recommended rules, `solid/no-unused-signal`, `solid/no-accessor-as-prop`, `solid/no-module-scope-reactive-primitive`, the `jsx-a11y` plugin's correctness rules, and `kk-forge/no-conditional-map`. `jsx-a11y/control-has-associated-label` and `jsx-a11y/label-has-associated-control` look 4 levels deep, not the default 2, for a control's or a label's text (the label rule also for its nested control): Solid's `<Show>` and `<For>` each add a level, and text behind two of them read as missing. A signal or memo at module scope is global state that bypasses the composition root, so a component or the composition root creates it. `kk-forge/no-conditional-map` fails a `.map()` list in JSX children under a condition, such as `{open && rows.map(…)}`, `||`, `??` or `? :`. Solid reruns such an expression on any change and builds every row again, and `solid/prefer-for` catches only a `.map()` that is the whole expression. Render the list with `<For>` inside `<Show>`.
- `wxt.json`, a WXT extension's entrypoints, under **WXT** below.
- `layers.json`, an app's architecture: the layers `entrypoints → orchestration → features → entities → shared`. A file imports only layers to its right, and entities also each other. It reaches another module only through that module's `exports.ts`, or `exports.<entrypoint>.ts`, where `<entrypoint>` names a folder or file in `src/entrypoints`, such as `exports.background.ts` or `exports.overlay.content.ts`. A module that has a surface for an entrypoint serves that entrypoint through it. A `shared` module is one file, which is its own surface, or a folder reached through its `exports.ts`. Each file or folder directly under `infra/` is a module of its own. Only `entrypoints` and `infra` import `infra`, which takes `entities` and `shared`.

  A test in a `tests/` folder whose parent folder holds `src/` may import any layer. For a nested `tests/` folder, the innermost one with a `src/` beside it counts. In such a test, `@/` and `~/` name that `src/`. The test reaches a module, an `infra` folder included, only through its `exports.ts` or an `exports.<entrypoint>.ts`. A `shared` or `infra` module that is one file is its own surface. The test may import any file of an entrypoint, which has no surface. A unit test inside `src/`, such as `foo.unit.test.ts` beside `foo.ts`, follows the rules of its module's other files, so it may import that module's internals.

  An `entities` module is what two or more modules of `features`, `orchestration` and `entities` import. A type and its logic live in the one module that uses them, so the rule fails an `entities` module with fewer consumers and names the one there is. That entity moves into its consumer, or into a feature the consumer uses when it is an `orchestration` module, which holds no logic. An import from another entity counts, since an entity that entities share cannot move into a feature. `shared` imports no entity. A type import, a re-export and a dynamic import with a literal path count. An import from `entrypoints` or `infra` does not count, since both use an entity on behalf of a feature: an entrypoint takes the type from that feature's surface, and an infra adapter stays generic behind the feature's port. A test does not count either, because a test follows its code. An `orchestration` module builds one action from two or more features, so the rule fails one whose files import fewer than two `features` modules, and an entrypoint starts a single feature directly. Its tests do not count. That an orchestration module holds no logic of its own is for review to hold, since no import shows it. Both counts report on the module's file, or on the first file by name directly in its folder.

  oxlint lints one file at a time, so the rule reads the imports of `features`, `orchestration` and `entities` from disk. In an editor, a report on a module changes only when the file it lands on is linted again.

## Use

```bash
npm install -D @kk-forge/oxlint-config oxlint oxlint-tsgolint
```

A Solid package also installs `eslint-plugin-solid` 0.19 or later. The presets need oxlint 1.90 and oxlint-tsgolint 7.0.2005 or later. oxlint resolves `extends` from the config's folder, so give the path:

```json
{
  "extends": [
    "./node_modules/@kk-forge/oxlint-config/typescript.json",
    "./node_modules/@kk-forge/oxlint-config/solid.json"
  ]
}
```

The package's lint script runs bare `oxlint`, and its fix script `oxlint --fix`, over the whole package. `.gitignore` and the config's `ignorePatterns` say what to skip, so tests, build scripts and tool configs are linted too. A folder list such as `oxlint src` leaves the rest unlinted, and no rule in a preset can see that.

The table above names the rest of `extends`. A library leaves out `layers.json`, since the layers describe an app's `src/`. A package's own rules go below `extends` and win. A package's config holds only exceptions about its own files or names, each with its reason. A rule that would suit any package belongs in a preset.

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
- A package with vitest tests adds `vitest.json`. Its `require-mock-type-parameters` reports each `vi.fn()` without a type parameter.
- `no-console` is allowed only in `src/shared/Logger.ts`. A logger elsewhere moves there.
- The package's `tsconfig.json` sets `"noImplicitReturns": true`, and its lint script runs bare `oxlint`.
- The peer versions rise to oxlint 1.90, oxlint-tsgolint 7.0.2005 and eslint-plugin-solid 0.19.

## Development

`mise run setup` installs the packages. `mise run check` type-checks, lints and formats, builds the plugin in `src/` into `dist/`, and runs the fixtures through the configs and the packed plugin.

## Release

Raise `version` in package.json and merge to main. A release that fails code the last release passed, such as a new rule, is a new major. CI publishes to npm once the `production` environment approves.
