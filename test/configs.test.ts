import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// oxlint runs with no flags in a folder whose config only extends typescript.json and solid.json, as a consumer's does.
// So the run also shows that typeAware and denyWarnings reach it through extends, and that solid.json finds the
// plugin from the package's folder.
await test("a config that extends both reports each broken rule of the fixture", () => {
  const run = spawnSync("npx", ["oxlint", "--format", "unix"], {
    cwd: new URL("fixtures", import.meta.url),
    encoding: "utf8",
  });
  assert.notEqual(run.status, 0, run.stdout + run.stderr);
  for (const rule of [
    "typescript(ban-ts-comment)",
    "eslint(prefer-const)",
    "typescript(no-explicit-any)",
    "typescript(no-floating-promises)",
    "solid(no-innerhtml)",
    "eslint(no-unmodified-loop-condition)",
    "eslint(no-unexpected-multiline)",
    "eslint(no-extend-native)",
    "eslint(preserve-caught-error)",
    "oxc(misrefactored-assign-op)",
    "unicorn(require-post-message-target-origin)",
    "unicorn(no-accessor-recursion)",
    "unicorn(no-array-fill-with-reference-type)",
    "typescript(no-unsafe-enum-comparison)",
    "eslint(no-console)",
  ]) {
    assert.match(run.stdout, new RegExp(rule.replace(/[()]/g, "\\$&")), run.stdout + run.stderr);
  }
  // typescript.json lets a file named Logger.ts call console, so the fixture's logger reports nothing.
  assert.doesNotMatch(run.stdout, /Logger\.ts/, run.stdout);
});

/**
 * Returns each `<path> <rule>` an oxlint run reports, sorted. It first checks that the run's problem total counts only
 * those, so a problem with no rule, such as a fixture that fails to parse, fails the test.
 */
function reports(stdout: string): string[] {
  const tagged = [...stdout.matchAll(/^(\S+?):\d+:\d+: .* \[\w+\/(\S+)\]$/gm)].map(
    (match) => `${match[1]} ${match[2]}`,
  );
  assert.equal(Number(/^(\d+) problems?$/m.exec(stdout)?.[1] ?? 0), tagged.length, stdout);
  return tagged.toSorted((left, right) => left.localeCompare(right));
}

// The tests pack the package as npm publishes it, so they lint through the built plugin a consumer installs.
await test("the packed package", async (packedPackage) => {
  const packed = mkdtempSync(join(tmpdir(), "oxlint-config-"));
  packedPackage.after(() => rmSync(packed, { recursive: true, force: true }));
  // The test skips prepack's build, which `mise run test` has run already, so it rewrites no dist/ file that a parallel
  // `mise run lint` is loading.
  const pack = spawnSync(
    "npm",
    ["pack", "--silent", "--ignore-scripts", "--pack-destination", packed],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  assert.equal(pack.status, 0, pack.stderr);
  const tarball = join(packed, pack.stdout.trim().split("\n").at(-1) ?? "");

  // Each file under test/layers/src or test/layers/tests named bad-* breaks one layer rule, and every other file follows
  // them.
  await packedPackage.test(
    "layers.json reports each import that breaks the layers and nothing else",
    () => {
      const unpacked = join(packed, "layers");
      mkdirSync(unpacked);
      assert.equal(spawnSync("tar", ["-xzf", tarball, "-C", unpacked]).status, 0);
      const config = join(unpacked, "consumer.json");
      writeFileSync(config, JSON.stringify({ extends: ["./package/layers.json"] }));
      const run = spawnSync("npx", ["oxlint", "-c", config, "--format", "unix"], {
        cwd: new URL("layers", import.meta.url),
        encoding: "utf8",
      });
      const broken = ["src", "tests"]
        .flatMap((folder) =>
          readdirSync(new URL(`layers/${folder}`, import.meta.url), {
            recursive: true,
            encoding: "utf8",
          }).map((file) => `${folder}/${file}`),
        )
        .filter((file) => basename(file).startsWith("bad-") && /\.tsx?$/.test(file))
        .map((file) => `${file} kk-forge(layers)`)
        .toSorted((left, right) => left.localeCompare(right));
      assert.deepEqual(reports(run.stdout), broken, run.stdout + run.stderr);
    },
  );

  // test/consumer is an app that installs the package and extends typescript.json and layers.json, which both load the
  // plugin. Its .oxlintrc.json, comment included, turns one-line-entry on for its WXT entrypoints and no-index-files off.
  await packedPackage.test(
    "a consumer's override turns one-line-entry on and no-index-files off for its entrypoints",
    (context) => {
      const installed = new URL("consumer/node_modules/@kk-forge/oxlint-config", import.meta.url);
      context.after(() =>
        rmSync(new URL("consumer/node_modules", import.meta.url), { recursive: true, force: true }),
      );
      mkdirSync(installed, { recursive: true });
      const untar = spawnSync(
        "tar",
        ["-xzf", tarball, "-C", fileURLToPath(installed), "--strip-components=1"],
        {
          encoding: "utf8",
        },
      );
      assert.equal(untar.status, 0, untar.stderr);
      const run = spawnSync("npx", ["oxlint", "--format", "unix"], {
        cwd: new URL("consumer", import.meta.url),
        encoding: "utf8",
      });
      assert.deepEqual(
        reports(run.stdout),
        [
          "src/entrypoints/bad-call-option/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-default-parameter/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-generator/index.ts eslint(require-yield)",
          "src/entrypoints/bad-generator/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-identifier-option/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-iife/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-logic/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-main-argument/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-nested-arrow/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-nested-call/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-then/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-two-calls/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-two-functions/index.ts kk-forge(one-line-entry)",
          "src/entrypoints/bad-two/index.ts kk-forge(one-line-entry)",
          "src/features/a/bad-feature.ts kk-forge(layers)",
          "src/features/a/index.ts kk-forge(no-index-files)",
          "src/index.ts kk-forge(no-index-files)",
          "tests/bad-deep.ts kk-forge(layers)",
        ],
        run.stdout + run.stderr,
      );
    },
  );
});
