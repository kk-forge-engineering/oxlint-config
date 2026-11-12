# @kk-forge/oxlint-config

Shared oxlint configs for KK Forge's TypeScript packages.

- `typescript.json`: the `correctness` category plus the bug-catching rules it lacks and `no-console`, type-aware, warnings fail. A file named `Logger.ts` may call `console`.
- `solid.json`: eslint-plugin-solid's recommended rules.
- `layers.json`: the layers `entrypoints → orchestration → features → entities → shared`. A file imports only layers to its right, and entities also each other. It reaches another module only through that module's `exports.ts`, or `exports.<entrypoint>.ts`: a module that has one for an entrypoint folder, such as `exports.background.ts`, serves that entrypoint through it. A `shared` module is one file, which is its own surface, or a folder reached through its `exports.ts`. Only `entrypoints` imports `infra`, which takes `entities` and `shared`.

## Use

```bash
npm install -D @kk-forge/oxlint-config oxlint oxlint-tsgolint
```

A Solid package also installs `eslint-plugin-solid`. oxlint resolves `extends` from the config's folder, so give the path:

```json
{
  "extends": [
    "./node_modules/@kk-forge/oxlint-config/typescript.json",
    "./node_modules/@kk-forge/oxlint-config/solid.json"
  ]
}
```

An app adds `"./node_modules/@kk-forge/oxlint-config/layers.json"` as a third entry. A library leaves it out, since the layers describe an app's `src/`. A package's own rules go below `extends` and win.

## Development

`mise run setup` installs the packages. `mise run check` type-checks, lints and formats, builds `src/layers.ts` into `dist/layers.js`, and runs the fixtures through the configs and the packed plugin.

## Release

Raise `version` in package.json and merge to main. CI publishes to npm once the `production` environment approves.
