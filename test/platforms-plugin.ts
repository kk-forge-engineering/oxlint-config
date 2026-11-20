// The rules `kk-forge/layers` and `kk-forge/environment` built over the preset's platforms and one more, `electron`,
// which ships in no preset. test/platforms holds its fixture, and test/configs.test.ts runs it, to show that a platform
// added as one entry of the table gets every platform check.
import type { Plugin } from "@oxlint/plugins";

import { newEnvironmentRule } from "../dist/environment.js";
import { newLayersRule } from "../dist/layers.js";
import { type Platform, platforms } from "../dist/platforms.js";

const electron: Platform = {
  adapter: "electron",
  sdk: { names: ["electron"], prefixes: [] },
  globals: ["electronAPI"],
  interfaceStrings: [],
  entryApi: {},
  entryApiAliases: [],
};

const withElectron = [...platforms, electron];

const plugin: Plugin = {
  meta: { name: "kk-forge-platforms" },
  rules: { layers: newLayersRule(withElectron), environment: newEnvironmentRule(withElectron) },
};

export default plugin;
