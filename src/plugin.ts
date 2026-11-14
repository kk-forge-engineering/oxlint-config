// The oxlint JS plugin `kk-forge`. `npm run build` compiles it to dist/plugin.js, which every preset that turns on one
// of its rules loads.
import type { Plugin } from "@oxlint/plugins";

import environment from "./environment.js";
import launcher from "./launcher.js";
import layers from "./layers.js";
import noConditionalMap from "./no-conditional-map.js";
import noIndexFiles from "./no-index-files.js";
import noInlineSvg from "./no-inline-svg.js";
import wxtEntrypointFolder from "./wxt-entrypoint-folder.js";

const plugin: Plugin = {
  meta: { name: "kk-forge" },
  rules: {
    environment,
    launcher,
    layers,
    "no-conditional-map": noConditionalMap,
    "no-index-files": noIndexFiles,
    "no-inline-svg": noInlineSvg,
    "wxt-entrypoint-folder": wxtEntrypointFolder,
  },
};

export default plugin;
