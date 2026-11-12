// The oxlint JS plugin `kk-forge`. `npm run build` compiles it to dist/plugin.js, which typescript.json and layers.json
// load.
import type { Plugin } from "@oxlint/plugins";

import layers from "./layers.js";
import noIndexFiles from "./no-index-files.js";
import oneLineEntry from "./one-line-entry.js";

const plugin: Plugin = {
  meta: { name: "kk-forge" },
  rules: { layers, "no-index-files": noIndexFiles, "one-line-entry": oneLineEntry },
};

export default plugin;
