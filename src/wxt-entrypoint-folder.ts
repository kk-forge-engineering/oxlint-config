// The rule `kk-forge/wxt-entrypoint-folder`: a script directly in a folder named entrypoints fails. WXT builds such a
// file too, but a folder keeps the entrypoint's other files beside its index.ts. The rule reads the file's path, so it
// needs no glob from the consumer.
import { basename, dirname } from "node:path";

import type { Context, CreateRule } from "@oxlint/plugins";

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Makes each WXT entrypoint a folder with an index.ts" },
  },
  create(context: Context) {
    const name = basename(context.filename);
    const entrypoint = /^(.+)\.[cm]?[jt]sx?$/.exec(name)?.[1];
    return {
      Program(program) {
        if (basename(dirname(context.filename)) === "entrypoints" && entrypoint !== undefined) {
          context.report({
            node: program,
            message: `A WXT entrypoint is a folder. Move ${name} to ${entrypoint}/index.ts.`,
          });
        }
      },
    };
  },
};

export default rule;
