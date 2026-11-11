# @kk-forge/oxlint-config

The oxlint rules KK Forge's TypeScript packages lint with.

- `base.json` turns on oxlint's `correctness` category as errors. It adds the bug-catching rules the category lacks: `any`, `@ts-ignore`, non-null assertions, a `switch` that misses a case, a misused promise, a `let` that stays the same, `var` and import cycles. A few more come from the `suspicious` category, such as a loop whose condition never changes and an enum compared with a raw value. It also turns on type-aware linting and fails on a warning, so a package runs a bare `oxlint`.
- `solid.json`: the recommended rules of eslint-plugin-solid, for a Solid package. oxlint runs a JS plugin's rule only when the config lists it, so the file lists them. It turns off `no-unassigned-vars`, which cannot see Solid assign a `let` through a JSX `ref`.

## Use

```bash
npm install -D @kk-forge/oxlint-config oxlint oxlint-tsgolint
```

A Solid package also installs `eslint-plugin-solid`. `.oxlintrc.json` takes the files by path, because oxlint resolves `extends` from the config's own folder:

```json
{
  "extends": ["./node_modules/@kk-forge/oxlint-config/base.json", "./node_modules/@kk-forge/oxlint-config/solid.json"]
}
```

A package's own rules and overrides go below `extends` and win over it. Point the path at the `node_modules` that holds the package, such as `../node_modules/…` in an npm workspace.

## Development

- `mise run setup` installs the packages, and `mise run check` lints `test/fixtures` through both files and expects each rule the fixture breaks.

## Release

Raise `version` in package.json and merge to main. The Release workflow runs `release-npm.yml@v4` of kk-forge-engineering/gh-actions. It runs `check` and packs the package with `mise run pack`. Once the `production` environment's reviewer approves, it publishes to npm through Trusted Publishing and tags `v<version>` with a GitHub Release.
