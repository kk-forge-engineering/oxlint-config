import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// oxlint runs with no flags in a folder whose config only extends typescript.json, solid.json and vitest.json, as a
// consumer's does. So the run also shows that typeAware and denyWarnings reach it through extends, and that solid.json
// finds the plugin from the package's folder.
await test("a config that extends the presets reports each broken rule of the fixture", () => {
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
    "import(no-unassigned-import)",
    "typescript(no-unsafe-enum-assignment)",
    "typescript(no-unsafe-argument)",
    "typescript(no-unsafe-call)",
    "typescript(no-unsafe-member-access)",
    "typescript(no-unsafe-return)",
    "typescript(only-throw-error)",
    "typescript(no-unnecessary-type-assertion)",
    "typescript(no-unnecessary-type-conversion)",
    "typescript(no-unnecessary-type-arguments)",
    "typescript(no-unnecessary-type-parameters)",
    "typescript(no-unnecessary-boolean-literal-compare)",
    "typescript(no-unnecessary-template-expression)",
    "typescript(no-extraneous-class)",
    "import(no-named-as-default-member)",
    "vitest(expect-expect)",
    "vitest(valid-expect)",
    "vitest(no-conditional-expect)",
    "vitest(no-standalone-expect)",
    "vitest(require-to-throw-message)",
    "vitest(valid-title)",
    "vitest(require-mock-type-parameters)",
    "typescript(no-unsafe-assignment)",
    "typescript(no-unsafe-type-assertion)",
    "typescript(no-deprecated)",
    "typescript(prefer-promise-reject-errors)",
    "eslint(eqeqeq)",
    "eslint(curly)",
    "eslint(max-lines)",
    "solid(no-module-scope-reactive-primitive)",
    "solid(validate-jsx-nesting)",
    "solid(no-unused-signal)",
    "solid(no-accessor-as-prop)",
    "solid(no-unassigned-vars)",
    "jsx-a11y(alt-text)",
    "jsx-a11y(control-has-associated-label)",
    "jsx-a11y(label-has-associated-control)",
  ]) {
    assert.match(run.stdout, new RegExp(rule.replace(/[()]/g, "\\$&")), run.stdout + run.stderr);
  }
  // vitest.json judges test files only, so utils/check.ts, which is no test, gets no vitest report.
  assert.doesNotMatch(run.stdout, /utils\/check\.ts:.*vitest/, run.stdout);
  // Each of these rules reports exactly once in Broken.tsx. solid.json's two label rules read text 4 levels deep,
  // through <Show>: of the two cells and the two labels only the one with no text at all is reported. eqeqeq keeps
  // == null: its report is for == "a", not for == null.
  for (const rule of [
    /jsx-a11y\(control-has-associated-label\)/g,
    /jsx-a11y\(label-has-associated-control\)/g,
    /eslint\(eqeqeq\)/g,
  ]) {
    assert.equal(run.stdout.match(rule)?.length, 1, run.stdout);
  }
  // typescript.json lets only infra call the console, so a Logger.ts elsewhere is reported.
  assert.doesNotMatch(run.stdout, /infra\/logger\.ts/, run.stdout);
  // A feature's infra/ is infra, and a test is not the program, so neither is reported for the console.
  assert.doesNotMatch(run.stdout, /features\/a\/infra\/sink\.ts:.*no-console/, run.stdout);
  assert.doesNotMatch(run.stdout, /Console\.test\.ts:.*no-console/, run.stdout);
  assert.match(
    run.stdout,
    /utils\/Logger\.ts:\d+:\d+: .* \[Error\/eslint\(no-console\)\]/,
    run.stdout,
  );
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

// The tests pack the package as npm publishes it, so they lint through the
// built plugin a consumer installs.
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

  // Each file under test/layers/src or test/layers/tests named bad-* breaks one rule of layers.json: kk-forge/environment
  // where it is named bad-env-*, and kk-forge/layers otherwise. Every other file keeps them. The test installs the
  // tarball outside the repo, so the plugin finds only the dependencies the package declares. --legacy-peer-deps skips
  // the peers, so the repo's own are used.
  await packedPackage.test(
    "layers.json reports each problem of the layers fixture and nothing else",
    () => {
      const installed = join(packed, "layers");
      mkdirSync(installed);
      writeFileSync(join(installed, "package.json"), JSON.stringify({ private: true }));
      const install = spawnSync(
        "npm",
        [
          "install",
          "--prefer-offline",
          "--ignore-scripts",
          "--legacy-peer-deps",
          "--no-audit",
          "--no-fund",
          tarball,
        ],
        { cwd: installed, encoding: "utf8" },
      );
      assert.equal(install.status, 0, install.stdout + install.stderr);
      const config = join(installed, "consumer.json");
      writeFileSync(
        config,
        JSON.stringify({ extends: ["./node_modules/@kk-forge/oxlint-config/layers.json"] }),
      );
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
        .map(
          (file) =>
            `${file} kk-forge(${basename(file).startsWith("bad-env-") ? "environment" : "layers"})`,
        )
        .toSorted((left, right) => left.localeCompare(right));
      assert.deepEqual(reports(run.stdout), broken, run.stdout + run.stderr);
    },
  );

  // test/consumer is a WXT app with Solid that installs the package and extends every preset but vitest.json. Each of
  // those loads the plugin, and the list shows each problem once. Each file named bad-* or in a folder named bad-*
  // breaks a rule, and so does each file named index.ts outside an entrypoint. A feature's surface reports in its
  // exports.ts and its use cases file, so the features badSurface and badEmpty break the rule there. Every other file
  // follows the rules.
  await packedPackage.test(
    "a WXT app with Solid gets a report for each broken rule and nothing else",
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
          "src/entrypoints/bad-call-option/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-default-parameter/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-flat.ts kk-forge(wxt-entrypoint-folder)",
          "src/entrypoints/bad-generator/index.ts eslint(require-yield)",
          "src/entrypoints/bad-generator/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-identifier-option/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-iife/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-logic/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-main-argument/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-nested-arrow/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-nested-call/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-render/index.tsx kk-forge(launcher)",
          "src/entrypoints/bad-then/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-two-calls/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-two-functions/index.ts kk-forge(launcher)",
          "src/entrypoints/bad-two/index.ts kk-forge(launcher)",
          "src/features/a/bad-feature.ts kk-forge(layers)",
          "src/features/a/bad-side-effect.ts import(no-unassigned-import)",
          "src/features/a/index.ts kk-forge(no-index-files)",
          "src/features/badEmpty/badEmptyUseCases.ts kk-forge(layers)",
          "src/features/badSurface/badSurfaceUseCases.background.ts kk-forge(layers)",
          "src/features/badSurface/badSurfaceUseCases.ts kk-forge(layers)",
          "src/features/badSurface/badSurfaceUseCases.ts kk-forge(layers)",
          "src/features/badSurface/badSurfaceUseCases.ts kk-forge(layers)",
          "src/features/badSurface/badSurfaceUseCases.ts kk-forge(layers)",
          "src/features/badSurface/exports.background.ts kk-forge(layers)",
          "src/features/badSurface/exports.ts kk-forge(layers)",
          "src/features/badSurface/exports.ts kk-forge(layers)",
          "src/features/badSurface/exports.ts kk-forge(layers)",
          "src/features/badSurface/exports.ts kk-forge(layers)",
          "src/features/list/bad-and.tsx kk-forge(no-conditional-map)",
          "src/features/list/bad-nullish.tsx kk-forge(no-conditional-map)",
          "src/features/list/bad-or.tsx kk-forge(no-conditional-map)",
          "src/features/list/bad-plain.tsx solid(prefer-for)",
          "src/features/list/bad-ternary.tsx kk-forge(no-conditional-map)",
          "src/features/svg/bad-nested.tsx kk-forge(no-inline-svg)",
          "src/features/svg/bad-nested.tsx kk-forge(no-inline-svg)",
          "src/features/svg/bad-path.tsx kk-forge(no-inline-svg)",
          "src/features/svg/bad-svg-path.tsx kk-forge(no-inline-svg)",
          "src/features/svg/bad-svg-svg.tsx kk-forge(no-inline-svg)",
          "src/features/svg/bad-svg.tsx kk-forge(no-inline-svg)",
          "src/index.ts kk-forge(no-index-files)",
          "tests/bad-deep.ts kk-forge(layers)",
        ],
        run.stdout + run.stderr,
      );
    },
  );
});
