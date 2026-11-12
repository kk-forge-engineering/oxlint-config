// The rule `kk-forge/no-index-files`: no file is named index, since tooling resolves that name implicitly and hides
// which file a caller reads.
import { basename } from "node:path";

import type { Context, CreateRule } from "@oxlint/plugins";

const rule: CreateRule = {
  meta: {
    type: "problem",
    docs: { description: "Forbids files named index, so a module’s surface is its exports.ts" },
  },
  create(context: Context) {
    const name = basename(context.filename);
    return {
      Program(program) {
        if (/^index\.[jt]sx?$/.test(name)) {
          context.report({
            node: program,
            message: `Name the module's surface exports.ts, not ${name}.`,
          });
        }
      },
    };
  },
};

export default rule;
