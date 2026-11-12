# @kk-forge/oxlint-config

Shared oxlint configs for KK Forge's TypeScript packages.

- `base.json`: the `correctness` category plus the bug-catching rules it lacks and `no-console`, type-aware, warnings fail. A file named `Logger.ts` may call `console`.
- `solid.json`: eslint-plugin-solid's recommended rules.
- `slices.json`: the layers `entrypoints → orchestration → features → entities → shared`. A file imports only layers to its right, and entities also each other. It reaches another module only through that module's `exports.ts`, or `exports.<runtime>.ts` where an entrypoint's runtime has one: `background` runs as `worker`, `content` as `content` and `frameScroller` as `frame`. Only `entrypoints` imports `infra`, which takes `entities` and `shared`.

## Use

```bash
npm install -D @kk-forge/oxlint-config oxlint oxlint-tsgolint
```

A Solid package also installs `eslint-plugin-solid`. oxlint resolves `extends` from the config's folder, so give the path:

```json
{
  "extends": [
    "./node_modules/@kk-forge/oxlint-config/base.json",
    "./node_modules/@kk-forge/oxlint-config/solid.json"
  ]
}
```

A package's own rules go below `extends` and win.

## Release

Raise `version` in package.json and merge to main. CI publishes to npm once the `production` environment approves.
