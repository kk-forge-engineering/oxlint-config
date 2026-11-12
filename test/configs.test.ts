import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";

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

// Each file under test/layers/src named bad-* breaks one layer rule, and every other file follows them. The test
// packs the package and lints through the unpacked tarball, so it runs the built plugin a consumer installs.
await test("layers.json reports each import that breaks the layers and nothing else", (context) => {
  const packed = mkdtempSync(join(tmpdir(), "oxlint-config-"));
  context.after(() => rmSync(packed, { recursive: true, force: true }));
  const pack = spawnSync("npm", ["pack", "--silent", "--pack-destination", packed], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(pack.status, 0, pack.stderr);
  const tarball = join(packed, pack.stdout.trim().split("\n").at(-1) ?? "");
  assert.equal(spawnSync("tar", ["-xzf", tarball, "-C", packed]).status, 0);
  const config = join(packed, "consumer.json");
  writeFileSync(config, JSON.stringify({ extends: ["./package/layers.json"] }));
  const run = spawnSync("npx", ["oxlint", "-c", config, "--format", "unix"], {
    cwd: new URL("layers", import.meta.url),
    encoding: "utf8",
  });
  const reported = [...run.stdout.matchAll(/^src\/(\S+?):\d+:/gm)]
    .map((match) => match[1])
    .toSorted((left, right) => left.localeCompare(right));
  const broken = readdirSync(new URL("layers/src", import.meta.url), {
    recursive: true,
    encoding: "utf8",
  })
    .filter((file) => basename(file).startsWith("bad-") && /\.tsx?$/.test(file))
    .toSorted((left, right) => left.localeCompare(right));
  assert.deepEqual(reported, broken, run.stdout + run.stderr);
});
