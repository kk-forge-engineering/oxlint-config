// The oxlint JS plugin `kk-forge`. `npm run build` compiles it to dist/plugin.js, which every preset that turns on one
// of its rules loads.
import type { Plugin } from "@oxlint/plugins";

import launcher from "./launcher.js";
import layers from "./layers.js";
import noConditionalMap from "./no-conditional-map.js";
import noIndexFiles from "./no-index-files.js";
import wxtEntrypointFolder from "./wxt-entrypoint-folder.js";

const plugin: Plugin = {
  meta: { name: "kk-forge" },
  rules: {
    launcher,
    layers,
    "no-conditional-map": noConditionalMap,
    "no-index-files": noIndexFiles,
    "wxt-entrypoint-folder": wxtEntrypointFolder,
  },
};

export default plugin;
